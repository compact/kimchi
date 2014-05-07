/**
 * Module dependencies.
 */

var express = require('express')
  , routes = require('./routes')
  , http = require('http')
  , path = require('path')
  // , mongoose = require('mongoose')
  // , passport = require('passport')
  // , db = require('./modules/db')(mongoose);

var app = express();

// all environments
app.set('port', process.env.PORT || 3001);
//app.set('views', __dirname + '/views');
app.set('view engine', 'jade');
app.use(express.logger('dev'));
app.use(express.bodyParser());
app.use(express.methodOverride());
app.use(express.cookieParser('appsecretLoL'));
app.use(express.cookieSession({ secret: 'appsecretLoL', cookie: { maxAge: 60 * 60 * 1000 }}));
//app.use(app.router);

console.log('current environment:', app.get('env'));
var staticDir = app.get('env') === 'development' ? 'app' : 'dist';
app.use(express.static(path.join(__dirname, staticDir)));

// development only
if ('development' == app.get('env')) {
  app.use(express.errorHandler());
}

//init server
app.listen(3001);
