var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
var fs = require('fs');

// Load local .env before requiring routes/services. Existing process.env values win.
var envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split(/\r?\n/).forEach(function(line) {
    if (!line || line.trim().startsWith('#')) return;
    var separator = line.indexOf('=');
    if (separator < 1) return;
    var key = line.slice(0, separator).trim();
    var value = line.slice(separator + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  });
}

var indexRouter = require('./routes/index');
var usersRouter = require('./routes/users');
var aiRouter = require('./routes/ai');
var booksRouter = require('./routes/books');
var adminRouter = require('./routes/admin');

var app = express();

app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

app.use(logger('dev'));
app.use(express.json({ limit: '8mb' }));
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', indexRouter);
app.use('/users', usersRouter);
app.use('/api/ai', aiRouter);
app.use('/api/books', booksRouter);
app.use('/admin', adminRouter);

app.use(function(req, res, next) {
  next(createError(404));
});

app.use(function(err, req, res, next) {
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};
  res.status(err.status || 500);
  res.render('error');
});

module.exports = app;
