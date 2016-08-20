import path from 'path';
import express from 'express';
import _ from 'lodash';
import {generateSheet, generateChoicesForSheet, getSheetSchema} from './sheets';
import isAuthenticated from 'auth/check';
import bodyParser from 'body-parser';

const app = express();
app.set('view engine', 'ejs');
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => res.render('index'))
app.get('/setup', (req, res) => res.redirect('/setup/login'));

// ----------------------------------------------------------------------------
// Mongo stuff
// ----------------------------------------------------------------------------
import mongoose from 'mongoose';
mongoose.connect(process.env.MONGO_URI);
import User from 'models/User';

// ----------------------------------------------------------------------------
// Passport stuff
// ----------------------------------------------------------------------------
import passport from 'passport';
import session from 'express-session';
import strategy from 'auth/strategy';
import serialize from 'auth/serialize';
app.use(session({secret: process.env.SESSION_SECRET}));
app.use(passport.initialize());
app.use(passport.session());
passport.use(strategy(User));
serialize(User, passport);

// ----------------------------------------------------------------------------
// Onboarding flow
// ----------------------------------------------------------------------------
// Step 1: login
app.get('/setup/login', passport.authenticate('twitter', {
  successRedirect: '/',
  failureRedirect: '/setup/login'
}));

app.get("/callback/twitter", passport.authenticate("twitter", {
  failureRedirect: '/login',
  failureFlash: true
}), (req, res) => {
  if (req.user.spreadsheet) {
    res.redirect(`/${req.user.handle}`);
  } else {
    res.redirect('/setup/spreadsheet')
  }
});

// Step 2: setup the spreadsheet
app.get('/setup/spreadsheet', isAuthenticated, (req, res) => res.render('configureSpreadsheet'));
app.post('/setup/spreadsheet', bodyParser.urlencoded(), (req, res) => {
  let match = req.body.spreadsheet.match(/^https:\/\/docs.google.com\/spreadsheets\/d\/(.+)$/);
  if (match) {
    User.update({_id: req.user._id}, {spreadsheet: match[1]}).exec().then(model => {
      res.redirect(`/${req.user.handle}`);
    }).catch(err => res.status(500).send({error: 'database error'}));
  } else {
    res.status(400).send({error: 'please enter a valid google sheets url'});
  }
});

// Notes
// For this to work, you need to make the sheet public with File -> Publish to the Web
// This means no api key is needed (no rate limit) and auth sucks to use in the googl ecosystem.
// app.get('/', (req, res) => res.redirect('/sheets/1DnHlU9IAN5-GRj3UXCnePmT02Fl2xD7fbvCx1uLKzeM'));
app.get('/density', (req, res) => res.redirect('/sheets/1frVwofgRgZYBo5NCGnPV2eNQB8gKvLEon21T6TGG5b0'));

app.get('/sheets/:sheetId', (req, res) => {
  if (req.query.pick) {
    // Pick the place
    generateSheet(req.params.sheetId)
    .then(sheet => generateChoicesForSheet(sheet, req.query))
    .then(choices => {
      res.render('chosenVenue', {place: _.sample(choices)});
    }).catch(console.error.bind(console));
  } else {
    // Choose criteria
    generateSheet(req.params.sheetId).then(getSheetSchema).then(fields => {
      res.render('venuePicker', {fields, sheetId: req.params.sheetId});
    }).catch(console.error.bind(console));
  }
});

// Load a selection
app.get('/:handle', (req, res) => {
  User.findOne({handle: req.params.handle}).exec().then(model => {
    if (!model.spreadsheet) {
      res.status(400).send({error: 'No spreadsheet was defined for this user.'});
    } else if (req.query.pick) {
      // Pick the place
      generateSheet(model.spreadsheet)
      .then(sheet => generateChoicesForSheet(sheet, req.query))
      .then(choices => {
        res.render('chosenVenue', {place: _.sample(choices)});
      }).catch(console.error.bind(console));
    } else {
      // Choose criteria
      generateSheet(model.spreadsheet).then(getSheetSchema).then(fields => {
        res.render('venuePicker', {fields, sheetId: req.params.sheetId});
      }).catch(console.error.bind(console));
    }
  }).catch(err => res.status(404).send({error: `No such user ${req.params.handle}`}));
});

app.listen(process.env.PORT || 8000);
