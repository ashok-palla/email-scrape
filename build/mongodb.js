"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const mongodb = require("mongodb");
class MongoDbDataAccessLayer {
    constructor() {
        this.MongoClient = mongodb.MongoClient;
        this.url = 'mongodb+srv://ashok_palla:palla_1@cluster0-nfc4h.mongodb.net/test?retryWrites=true&w=majority';
        this.dataBaseName = 'email-scrapping';
    }
    // tslint:disable-next-line:ban-types
    get(collectionName, filter, callback) {
        try {
            this.MongoClient.connect(this.url, { useNewUrlParser: true, useUnifiedTopology: true }, (err, db) => {
                if (err) {
                    throw err;
                }
                this.dataBase = db.db(this.dataBaseName);
                const collection = this.dataBase.collection(collectionName);
                collection.find(filter).toArray((collectionErr, docs) => {
                    db.close();
                    if (collectionErr) {
                        callback();
                    }
                    callback(docs);
                });
            });
        }
        catch (err) {
            callback(err);
        }
    }
}
const mongoDbDataAccessLayer = new MongoDbDataAccessLayer();
exports.default = mongoDbDataAccessLayer;
