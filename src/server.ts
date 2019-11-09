import * as async from 'async';
import * as bodyParser from 'body-parser';
import * as cheerio from 'cheerio';
import * as compression from 'compression';
import * as cors from 'cors';
import { NextFunction, Request, Response } from 'express';
import * as express from 'express';
import * as helmet from 'helmet';
import * as https from 'https';
import * as request from 'request';
import { isNullOrUndefined } from 'util';
import * as XLSX from 'xlsx';
import mongoDbDataAccessLayer from './mongodb';
class Server {
  // set app to be of type express.Application
  public app: express.Application;

  constructor() {
    this.app = express();
    this.config();
    this.routes();
  }

  // application config
  public config(): void {
    // express middleware
    this.app.use(bodyParser.urlencoded({ extended: true }));
    this.app.use(bodyParser.json());
    this.app.use('/files', express.static('files'));
    this.app.use(compression());
    this.app.use(helmet());
    // this.app.use(cors());
    this.app.use(cors({ exposedHeaders: ['Authorization'] }));

    this.app.use((req: Request, res: Response, next: NextFunction) => {
      res.setHeader('Last-Modified', (new Date()).toUTCString());
      req.headers['if-none-match'] = 'no-match-for-this';
      res.header('Access-Control-Allow-Origin', '*');
      res.header(
        'Access-Control-Allow-Methods',
        'GET, POST, PUT, DELETE, OPTIONS',
      );
      res.header(
        'Access-Control-Allow-Headers',
        'Origin, X-Requested-With, Content-Type, Accept, Authorization, Access-Control-Allow-Credentials',
      );
      res.header('Access-Control-Allow-Credentials', 'true');
      next();
    });
  }

  // application routes
  public routes(): void {
    const version = '/api/v1/';
    const router: express.Router = express.Router();
    this.app.use('/', router);
    this.scrapeEmailInit();
    // this.writeXlsx();
    // this.test();
  }
  private scrapeEmailInit() {
    // tslint:disable-next-line: max-line-length
    const url: string = 'https://journals.plos.org/plosone/dynamicSearch?filterJournals=PLoSONE&resultsPerPage=1&q=disorder&sortOrder=DATE_NEWEST_FIRST&page=1';
    https.get(url, (response) => {
      let data: string = '';
      response.on('data', (chunk) => {
        data += chunk;
      });
      response.on('end', () => {
        console.info('Total no.of journals: ' + JSON.parse(data).searchResults.numFound);
        this.scrapeEmails(100, JSON.parse(data).searchResults.numFound);
      });
    });
  }
  private scrapeEmails(perPage: number, totalRecords: number) {
    let pageNumber: number = 1;
    const maxPages: number = Math.ceil(totalRecords / perPage);
    let journals: object[] = [];
    async.whilst(() => maxPages >= pageNumber, (next) => {
      console.info('Loading page ' + pageNumber + ' out of ' + maxPages);
      // tslint:disable-next-line: max-line-length
      const url: string = `https://journals.plos.org/plosone/dynamicSearch?filterJournals=PLoSONE&resultsPerPage=${perPage}&q=disorder&sortOrder=DATE_NEWEST_FIRST&page=${pageNumber}`;
      https.get(url, (response) => {
        let data: string = '';
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
  private scrapeAuthorEmail(journals: object[], set: number, callback) {
    let iterationIndex = 0;
    async.whilst(() => (journals.length - 1) >= iterationIndex, (next) => {
      const item = journals[iterationIndex];
      request('https://journals.plos.org' + item['link'].replace('article', 'article/authors'), (error, res, html) => {
        if (!error && res.statusCode === 200) {
          const $ = cheerio.load(html);
          $('section.authors').find('dl').find('dd').toArray().forEach((ele, ind) => {
            if (!isNullOrUndefined($(ele).find($('span.email')).html())) {
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
        } else { 
          console.log(res.statusCode, item); 
          iterationIndex++;
          next();
        }
      });

    });
  }
  private add(journals: object[], set: number) {
    try {
      // tslint:disable-next-line:max-line-length
      mongoDbDataAccessLayer.MongoClient.connect(mongoDbDataAccessLayer.url, { useNewUrlParser: true, useUnifiedTopology: true }, (err, db) => {
        if (err) { throw err; }
        const dataBase = db.db(mongoDbDataAccessLayer.dataBaseName);
        // tslint:disable-next-line:max-line-length
        const collection = dataBase.collection('journals_plos');
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
    } catch (error) { console.log(error); }
  }
  private writeXlsx() {
    // tslint:disable-next-line:max-line-length
    mongoDbDataAccessLayer.MongoClient.connect(mongoDbDataAccessLayer.url, { useNewUrlParser: true, useUnifiedTopology: true }, (err, db) => {
      if (err) { throw err; }
      const dataBase = db.db(mongoDbDataAccessLayer.dataBaseName);
      // tslint:disable-next-line:max-line-length
      const collection = dataBase.collection('journals_plos');
      collection.find({}).project({ _id: 0 }).toArray((collectionErr, data) => {
        if (collectionErr) { console.log(err); }
        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Journals PLOS');
        XLSX.writeFile(wb, 'journals_plos.xlsx');
        console.log('Completed');
      });
    });
  }
  private test() {
    request('https://journals.plos.org/plosone/article/authors?id=10.1371/journal.pone.0224752', (error, res, html) => {
      if (!error && res.statusCode === 200) {
        const $ = cheerio.load(html);
        $('section.authors').find('dl').find('dd').toArray().forEach((ele, ind) => {
          if (!isNullOrUndefined($(ele).find($('span.email')).html())) {
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
export default new Server().app;