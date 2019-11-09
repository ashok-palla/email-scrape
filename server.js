"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const async = require("async");
const bodyParser = require("body-parser");
const cheerio = require("cheerio");
const compression = require("compression");
const cors = require("cors");
const express = require("express");
const helmet = require("helmet");
const https = require("https");
const request = require("request");
const util_1 = require("util");
const XLSX = require("xlsx");
const mongodb_1 = require("./mongodb");
class Server {
    constructor() {
        this.app = express();
        this.config();
        this.routes();
    }
    // application config
    config() {
        // express middleware
        this.app.use(bodyParser.urlencoded({ extended: true }));
        this.app.use(bodyParser.json());
        this.app.use('/files', express.static('files'));
        this.app.use(compression());
        this.app.use(helmet());
        // this.app.use(cors());
        this.app.use(cors({ exposedHeaders: ['Authorization'] }));
        this.app.use((req, res, next) => {
            res.setHeader('Last-Modified', (new Date()).toUTCString());
            req.headers['if-none-match'] = 'no-match-for-this';
            res.header('Access-Control-Allow-Origin', '*');
            res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
            res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Access-Control-Allow-Credentials');
            res.header('Access-Control-Allow-Credentials', 'true');
            next();
        });
    }
    // application routes
    routes() {
        const version = '/api/v1/';
        const router = express.Router();
        this.app.use('/', router);
        this.scrapeEmailInit();
        // this.writeXlsx();
        // this.test();
    }
    scrapeEmailInit() {
        // tslint:disable-next-line: max-line-length
        const url = 'https://journals.plos.org/plosone/dynamicSearch?filterJournals=PLoSONE&resultsPerPage=1&q=disorder&sortOrder=DATE_NEWEST_FIRST&page=1';
        https.get(url, (response) => {
            let data = '';
            response.on('data', (chunk) => {
                data += chunk;
            });
            response.on('end', () => {
                console.info('Total no.of journals: ' + JSON.parse(data).searchResults.numFound);
                this.scrapeEmails(100, JSON.parse(data).searchResults.numFound);
            });
        });
    }
    scrapeEmails(perPage, totalRecords) {
        let pageNumber = 1;
        const maxPages = Math.ceil(totalRecords / perPage);
        let journals = [];
        async.whilst(() => maxPages >= pageNumber, (next) => {
            console.info('Loading page ' + pageNumber + ' out of ' + maxPages);
            // tslint:disable-next-line: max-line-length
            const url = `https://journals.plos.org/plosone/dynamicSearch?filterJournals=PLoSONE&resultsPerPage=${perPage}&q=disorder&sortOrder=DATE_NEWEST_FIRST&page=${pageNumber}`;
            https.get(url, (response) => {
                let data = '';
                response.on('data', (chunk) => {
                    data += chunk;
                });
                response.on('end', () => {
                    journals = journals.concat(JSON.parse(data).searchResults.docs);
                    console.info(pageNumber + ': Journals Loading Completed');
                    this.scrapeAuthorEmail(journals, pageNumber, () => {
                        journals = [];
                        pageNumber++;
                        next();
                    });
                });
            });
        });
    }
    scrapeAuthorEmail(journals, set, callback) {
        let iterationIndex = 0;
        async.whilst(() => (journals.length - 1) >= iterationIndex, (next) => {
            const item = journals[iterationIndex];
            request('https://journals.plos.org' + item['link'].replace('article', 'article/authors'), (error, res, html) => {
                if (!error && res.statusCode === 200) {
                    const $ = cheerio.load(html);
                    $('section.authors').find('dl').find('dd').toArray().forEach((ele, ind) => {
                        if (!util_1.isNullOrUndefined($(ele).find($('span.email')).html())) {
                            item['author_name'] = $($('section.authors')
                                .find('dl').find('dt').toArray()[ind]).html().trim();
                        }
                    });
                    item['email'] = $('span.email').parent().children('a').html();
                    console.log(set + ' : ' + iterationIndex + ' : ' + item['email']);
                    if (iterationIndex === (journals.length - 1)) {
                        const dt = journals;
                        journals = [];
                        console.info(set + ': Scrapping Completed');
                        this.add(dt, set);
                        callback();
                    }
                    iterationIndex++;
                    next();
                }
                else {
                    console.log(res.statusCode, item);
                    iterationIndex++;
                    next();
                }
            });
        });
    }
    add(journals, set) {
        try {
            // tslint:disable-next-line:max-line-length
            mongodb_1.default.MongoClient.connect(mongodb_1.default.url, { useNewUrlParser: true, useUnifiedTopology: true }, (err, db) => {
                if (err) {
                    throw err;
                }
                const dataBase = db.db(mongodb_1.default.dataBaseName);
                // tslint:disable-next-line:max-line-length
                const collection = dataBase.collection('journals_plos_heroku');
                journals = journals.map((itemMap) => {
                    return {
                        title: itemMap['title'],
                        author_name: itemMap['author_name'],
                        email: itemMap['email'],
                        publication_date: new Date(itemMap['publication_date']),
                        link: itemMap['link']
                    };
                });
                collection.insertMany(journals).then(() => {
                    console.log(set + ' insert completed');
                });
            });
        }
        catch (error) {
            console.log(error);
        }
    }
    writeXlsx() {
        // tslint:disable-next-line:max-line-length
        mongodb_1.default.MongoClient.connect(mongodb_1.default.url, { useNewUrlParser: true, useUnifiedTopology: true }, (err, db) => {
            if (err) {
                throw err;
            }
            const dataBase = db.db(mongodb_1.default.dataBaseName);
            // tslint:disable-next-line:max-line-length
            const collection = dataBase.collection('journals_plos');
            collection.find({}).project({ _id: 0 }).toArray((collectionErr, data) => {
                if (collectionErr) {
                    console.log(err);
                }
                const ws = XLSX.utils.json_to_sheet(data);
                const wb = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(wb, ws, 'Journals PLOS');
                XLSX.writeFile(wb, 'journals_plos.xlsx');
                console.log('Completed');
            });
        });
    }
    test() {
        request('https://journals.plos.org/plosone/article/authors?id=10.1371/journal.pone.0224752', (error, res, html) => {
            if (!error && res.statusCode === 200) {
                const $ = cheerio.load(html);
                $('section.authors').find('dl').find('dd').toArray().forEach((ele, ind) => {
                    if (!util_1.isNullOrUndefined($(ele).find($('span.email')).html())) {
                        // tslint:disable-next-line: max-line-length
                        console.log('Author - ' + $($('section.authors').find('dl').find('dt').toArray()[ind]).html().trim());
                    }
                });
                console.log('Email - ' + $('span.email').parent().children('a').html());
            }
        });
    }
}
// export
exports.default = new Server().app;
