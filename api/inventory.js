const app = require( "express" )();
const server = require( "http" ).Server( app );
const bodyParser = require( "body-parser" );
const Datastore = require( "nedb" );
const async = require( "async" );
const fileUpload = require('express-fileupload');
const multer = require("multer");
const fs = require('fs');
const path = require('path');
const { uploadsPath, dbPath } = require('./config');

const storage = multer.diskStorage({
    destination: uploadsPath,
    filename: function(req, file, callback){
        callback(null, Date.now() + '.jpg');
    }
});


let upload = multer({storage: storage});

app.use(bodyParser.json());


module.exports = app;


let inventoryDB = new Datastore( {
    filename: path.join(dbPath, 'inventory.db'),
    autoload: true
} );


inventoryDB.ensureIndex({ fieldName: '_id', unique: true });

 
app.get( "/", function ( req, res ) {
    res.send( "Inventory API" );
} );


 
app.get( "/product/:productId", function ( req, res ) {
    if ( !req.params.productId ) {
        res.status( 500 ).send( "ID field is required." );
    } else {
        // Keep as string if it starts with 0 or contains non-numeric chars (preserves barcodes like "00049000061017")
        const productId = (req.params.productId.startsWith('0') || isNaN(req.params.productId))
            ? req.params.productId
            : parseInt(req.params.productId);

        inventoryDB.findOne( {
            _id: productId
        }, function ( err, product ) {
            if (err) {
                res.status( 500 ).send( err );
            } else if (!product) {
                res.status( 404 ).send( "Product not found" );
            } else {
                res.send( product );
            }
        } );
    }
} );


 
app.get( "/products", function ( req, res ) {
    inventoryDB.find( {}, function ( err, docs ) {
        res.send( docs );
    } );
} );


 
app.post( "/product", upload.single('imagename'), function ( req, res ) {

    let image = '';

    if(req.body.img != "") {
        image = req.body.img;        
    }

    if(req.file) {
        image = req.file.filename;  
    }
 

    if(req.body.remove == 1) {
        const imagePath = path.join(uploadsPath, req.body.img);
        try {
          fs.unlinkSync(imagePath)
        } catch(err) {
          console.error(err)
        }

        if(!req.file) {
            image = '';
        }
    }
    
    // Determine product ID - preserve string barcodes with leading zeros
    let productId = null;
    if (req.body.id) {
        // Keep as string if it starts with 0 or is explicitly a string barcode
        productId = (req.body.id.startsWith('0') || isNaN(req.body.id))
            ? req.body.id
            : parseInt(req.body.id);
    } else if (req.body.barcode) {
        productId = req.body.barcode; // Always use barcode as-is (string)
    }

    let Product = {
        _id: productId,
        price: req.body.price,
        category: req.body.category,
        quantity: req.body.quantity == "" ? 0 : req.body.quantity,
        name: req.body.name,
        stock: req.body.stock == "on" ? 0 : 1,
        img: image
    }

    if(req.body.id == "") {
        // Use scanned/entered barcode as ID, or generate timestamp if not provided
        Product._id = req.body.barcode ? req.body.barcode : Math.floor(Date.now() / 1000).toString();
        inventoryDB.insert( Product, function ( err, product ) {
            if ( err ) res.status( 500 ).send( err );
            else res.send( product );
        });
    }
    else {
        // Update existing product - use the already processed productId
        inventoryDB.update( {
            _id: productId
        }, Product, {}, function (
            err,
            numReplaced,
            product
        ) {
            if ( err ) res.status( 500 ).send( err );
            else res.sendStatus( 200 );
        } );

    }

});



 
app.delete( "/product/:productId", function ( req, res ) {
    // Keep as string if it starts with 0 or contains non-numeric chars (preserves barcodes like "00049000061017")
    const productId = (req.params.productId.startsWith('0') || isNaN(req.params.productId))
        ? req.params.productId
        : parseInt(req.params.productId);

    inventoryDB.remove( {
        _id: productId
    }, function ( err, numRemoved ) {
        if ( err ) {
            res.status( 500 ).send( err );
        } else if (numRemoved === 0) {
            res.status( 404 ).send( "Product not found" );
        } else {
            res.sendStatus( 200 );
        }
    } );
} );

 

app.post( "/product/sku", function ( req, res ) {
    var request = req.body;
    // Try to find by exact match first (for string barcodes), then try parseInt (for old numeric IDs)
    inventoryDB.findOne( {
            _id: request.skuCode
    }, function ( err, product ) {
        if (product) {
            res.send( product );
        } else {
            // Try with parseInt for backwards compatibility with old numeric IDs
            inventoryDB.findOne( {
                _id: parseInt(request.skuCode)
            }, function ( err, product ) {
                res.send( product );
            } );
        }
    } );
} );

 


app.decrementInventory = function ( products ) {

    async.eachSeries( products, function ( transactionProduct, callback ) {
        // Keep as string if it starts with 0 or contains non-numeric chars (preserves barcodes)
        const productId = (typeof transactionProduct.id === 'string' && transactionProduct.id.startsWith('0')) || isNaN(transactionProduct.id)
            ? transactionProduct.id
            : parseInt(transactionProduct.id);

        inventoryDB.findOne( {
            _id: productId
        }, function (
            err,
            product
        ) {

            if ( !product || !product.quantity ) {
                callback();
            } else {
                let updatedQuantity =
                    parseInt( product.quantity) -
                    parseInt( transactionProduct.quantity );

                // Use the product's _id as-is (already correct type in database)
                inventoryDB.update( {
                        _id: product._id
                    }, {
                        $set: {
                            quantity: updatedQuantity
                        }
                    }, {},
                    callback
                );
            }
        } );
    } );
};