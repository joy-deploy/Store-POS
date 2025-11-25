const app = require( "express" )();
const server = require( "http" ).Server( app );
const bodyParser = require( "body-parser" );
const Datastore = require( "@seald-io/nedb" );
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
    autoload: true,
    timestampData: true
} );

// Enable auto-compaction to ensure data persists to disk (important for Windows)
inventoryDB.persistence.setAutocompactionInterval(10000); // Compact every 10 seconds

inventoryDB.ensureIndex({ fieldName: '_id', unique: true });

 
app.get( "/", function ( req, res ) {
    res.send( "Inventory API" );
} );


 
app.get( "/product/:productId", function ( req, res ) {
    if ( !req.params.productId ) {
        res.status( 500 ).send( "ID field is required." );
    } else {
        // Try to find by exact match first (string), then try parseInt (for numeric IDs)
        inventoryDB.findOne( {
            _id: req.params.productId
        }, function ( err, product ) {
            if (err) {
                res.status( 500 ).send( err );
            } else if (product) {
                res.send( product );
            } else {
                // Try with parseInt for backwards compatibility with numeric IDs
                inventoryDB.findOne( {
                    _id: parseInt(req.params.productId)
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
    
    // Determine product ID - ALWAYS preserve barcodes as strings
    let productId = null;

    // Check barcode first - if provided, always use as-is (string)
    if (req.body.barcode) {
        productId = req.body.barcode; // Always use barcode as-is (string)
    } else if (req.body.id) {
        // Only convert to number if it's NOT a barcode (i.e., no barcode field provided)
        // Keep as string if it starts with 0 or is explicitly a string
        productId = (req.body.id.startsWith('0') || isNaN(req.body.id))
            ? req.body.id
            : parseInt(req.body.id);
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
        // Try to find product by exact ID match first (preserves string/number type)
        inventoryDB.findOne( {
            _id: transactionProduct.id
        }, function (
            err,
            product
        ) {

            // If not found and ID is numeric-looking, try with parseInt
            if ( !product && !isNaN(transactionProduct.id) ) {
                inventoryDB.findOne( {
                    _id: parseInt(transactionProduct.id)
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
            } else if ( !product || !product.quantity ) {
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