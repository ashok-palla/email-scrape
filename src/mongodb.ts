import * as mongodb from 'mongodb';
class MongoDbDataAccessLayer {
    public MongoClient = mongodb.MongoClient;
    public url = 'mongodb+srv://ashok_palla:palla_1@cluster0-nfc4h.mongodb.net/test?retryWrites=true&w=majority';
    public dataBaseName = 'email-scrapping';
    public dataBase: mongodb.Db;
    // tslint:disable-next-line:ban-types
    public get(collectionName: string, filter?: object, callback?: Function) {
        try {
            this.MongoClient.connect(this.url, { useNewUrlParser: true, useUnifiedTopology: true }, (err, db) => {
                if (err) { throw err; }
                this.dataBase = db.db(this.dataBaseName);
                const collection = this.dataBase.collection(collectionName);
                collection.find(filter).toArray((collectionErr, docs) => {
                    db.close();
                    if (collectionErr) { callback(); }
                    callback(docs);
                });
            });

        } catch (err) {
            callback(err);
        }
    }
}
const mongoDbDataAccessLayer = new MongoDbDataAccessLayer();
export default mongoDbDataAccessLayer;