
/**
 * Module dependencies.
 */

var fs           = require('fs')
  , path         = require('path')
  , glob         = require('glob')
  , parser       = require('./parser')
  , translations = require('./translations')
  , colors       = require('colors')
  , syntax       = require('./syntax')
  , _            = require('underscore')
  , merger       = require('./merger')
  , readline     = require('readline')
  , file         = require('./file');

/**
 * Update
 *
 * @constructor
 */

function Update() {
  this.functionCallRegex = lcf.TRANSLATION_FUNCTION_CALL_REGEX;
  this.isWaitingUserInput = false;
  this.deletedKeys = [];
  this.addedKeys = [];
  this.migratedKeys = [];
  // readline interface
  this.rl;
  // file sources
  this.src = cf.src;
  // locales
  this.locales = cf.locales;
  // default locale
  this.defaultLocale = cf.defaultLocale;
  // locales folder
  this.localesFolder = cf.localesFolder;
  // new line
  this.newline = '\n';
}

/**
 * Update keys
 *
 * @return {void}
 * @public
 */

Update.prototype.update = function() {
  var _this = this;
  var newTranslations = this._getSourceKeys()
  this._mergeTranslations(newTranslations, function(err, _newTranslations) {
    if(!err) {
      return file.writeTranslations(_newTranslations);
    }
    console.error('Translation update failed');
  });
};

/**
 * Strip inner functions calls. All function calls that is not gt()
 * needs to be removed. Because they can cause updating error
 * when they are defined inside vars like below
 *
 *    Example:
 *
 *      gt('SOME_TRANSLATION_KEY', {
 *        prop1 : test() // Becomes ''
 *      });
 *
 * @param {string} content, file content
 * @private
 */

Update.prototype._stripInnerFunctionCalls = function(content) {
  return content.replace(lcf.TRANSLATION_INNER_FUNCTION_CALL_REGEX, function(m) {
    if(/gt\(/g.test(m)) {
      return m;
    } else {
      return '';
    }
  });
};

/**
 * Get translation function calls form source
 *
 * @return {Object} newTranslations
 * @private
 */

Update.prototype._getSourceKeys = function() {
  var _this = this, newTranslations = {};
  this.src.forEach(function(file) {
    var content = _this._stripInnerFunctionCalls(fs.readFileSync(file, 'utf8'));
    // Match all gt() calls
    var calls = content.match(_this.functionCallRegex);
    if(calls !== null) {
      calls.forEach(function(call) {
        var key  = parser.getKey(call)
          , vars = parser.getVars(call);
        if(!(key in newTranslations)) {
          newTranslations[key] = {};
          newTranslations[key].key = key;
          newTranslations[key].vars = vars;
          newTranslations[key].files = [file];
        }
        else {
          if(syntax.hasErrorDuplicate(newTranslations, key, vars)) {
            throw new TypeError('You have defined a translation key ('
              + key + ') with different vars.\n In file:' + file);
          }
          newTranslations[key].files.push(file);
        }
      });
    }
  });

  return newTranslations;
};

/**
 * Merge new translations with old translations
 *
 * @param {Object} newTranslations
 * @param {function} callback
 *
 * @return newTranslations {Object}
 * @private
 */

Update.prototype._mergeTranslations = function(newTranslations, callback) {

  var oldTranslations  = file.readTranslations()
    , _newTranslations = {}
    , now              = Date.now();

  for(var i in this.locales) {
    var locale = this.locales[i];
    _newTranslations[locale] = JSON.parse(JSON.stringify(newTranslations));
    for(var key in _newTranslations[locale]) {
      if(typeof oldTranslations[locale] !== 'undefined') {
        var _new = _newTranslations[locale]
          , old  = oldTranslations[locale];
        // Assign translation
        _newTranslations[locale] = merger.mergeTranslations(_new, old, key);
        // Set timestamp
        _newTranslations[locale] = merger.mergeTimeStamp(_new, old, key);
        // Assign id
        _newTranslations[locale] = merger.mergeId(_new, old, key);
      }
      else {
        _newTranslations[locale][key].value = [];
        _newTranslations[locale][key].timestamp = now;
      }
    }
  };

  this._mergeUserInputs(_newTranslations, oldTranslations, function(err, _newTranslations) {
    if(!err) {
      return callback(null, _newTranslations);
    }
    if(err.error === 'SIGINT') {
      return callback(null, oldTranslations);
    }
    callback(err);
  });
};

/**
 * Get deleted translations. This method returns deleted translations
 * by looking at the source updated translations (newTranslations)
 * and the current stored translations (oldTranslations)
 *
 * @param {Object} newTranslations
 * @param {Object} oldTranslations
 *
 * @return deletedTranslations {Object}
 *
 *   Returns:
 *     {
 *       TRANSLATION_KEY1 : {
 *          LOCALE1 : {
 *
 *          },
 *          LOCALE2 : {
 *
 *          },
 *          ...
 *          timestamp : TIMESTAMP,
 *          files : [FILE1, FILE2, ...]
 *       },
 *       TRANSLATION_KEY1 : {
 *          LOCALE1 : {
 *
 *          },
 *          LOCALE2 : {
 *
 *          },
 *          ...
 *          timestamp : TIMESTAMP,
 *          files : [FILE1, FILE2, ...]
 *       },
 *       ...
 *     }
 *
 * @private
 */

Update.prototype._getDeletedTranslations = function(newTranslations, oldTranslations) {
  var now = Date.now(), deletedTranslations = {};
  for(var i in this.locales) {
    for(var key in oldTranslations[this.locales[i]]) {
      if(!(key in newTranslations[this.locales[i]])) {
        if(!(key in deletedTranslations)){
          deletedTranslations[key] = {};
        }
        if('value' in oldTranslations[this.locales[i]][key]) {
          deletedTranslations[key][this.locales[i]] = oldTranslations[this.locales[i]][key];
        } else {
          deletedTranslations[key][this.locales[i]] = [];
        }
        deletedTranslations[key].timestamp = now;
        deletedTranslations[key].files = oldTranslations[this.locales[i]][key].files;
      }
    }
  }

  return deletedTranslations;
};

/**
 * Get newly added translation key files. If a key have been added
 * to to source that never been added before. You can get
 * the path to the file/files where the key is used. This method
 * is useful during translation key update. Because we can
 * check which other keys is existing in that newly added key's file.
 * So smart updating of keys without losing stored values can be achieved.
 *
 * @param {Object} newTranslations
 * @param {Object} oldTranslations
 * @return {Object} files
 *
 *   Returns:
 *      {
 *        'FILE1' : [TRANSLATION_KEY1, TRANSLATION_KEY2, ...],
 *        'FILE2' : [TRANSLATION_KEY1, TRANSLATION_KEY2, ...],
 *        ...
 *      }
 *
 * @private
 */

Update.prototype._getUpdatedFiles = function(newTranslations, oldTranslations) {
  var files = {};
  for(var key in newTranslations[this.defaultLocale]) {
    if(!(key in oldTranslations[this.defaultLocale])) {
      var translationFiles = newTranslations[this.defaultLocale][key].files;
      for(var file in translationFiles) {
        if(!(translationFiles[file] in files)) {
          files[translationFiles[file]] = [key];
        }
        else if(!_.contains(files[translationFiles[file]], key)) {
          files[translationFiles[file]].push(key);
        }
      }
    }
  }

  return files;
};

/**
 * Merge user inputs.
 *
 * @param {Object} newTranslations
 * @param {Object} oldTranslations
 *
 * @return {void}
 * @private
 */

Update.prototype._mergeUserInputs = function(newTranslations, oldTranslations, callback) {
  var _this = this;
  var deletedTranslations = this._getDeletedTranslations(newTranslations, oldTranslations);
  if(_.size(deletedTranslations) === 0) {
    return callback(null, newTranslations);
  }

  var updatedFiles = this._getUpdatedFiles(newTranslations, oldTranslations);
  for(var key in deletedTranslations) {
    for(var file in deletedTranslations[key].files) {

      if(!_.has(updatedFiles, deletedTranslations[key].files[file])) {
        continue;
      }
      this.pushToUserInputStream(key, updatedFiles[deletedTranslations[key].files[file]]);
    }
  }

  this.executeUserInputStream(newTranslations, oldTranslations, function(err, _newTranslations) {
    if(!err) {
      return callback(null, _newTranslations);
    }
    callback(err);
  });
};

/**
 * Push to user input stream.
 *
 * @param {String} deletedKey
 * @param {Array} addedKeys
 *
 * @return {void}
 * @public
 */

Update.prototype.pushToUserInputStream = function(deletedKey, addedKeys) {
  if(typeof deletedKey !== 'string') {
    throw new TypeError('Frist parameter must be a string');
  }
  if(!_.isArray(addedKeys)) {
    throw new TypeError('Second parameter must be an array, containing translation keys');
  }
  this.deletedKeys.push(deletedKey);
  this.addedKeys.push(addedKeys);
};

/**
 * Execute user input stream
 */

Update.prototype.executeUserInputStream = function(newTranslations, oldTranslations, callback) {
  var _this = this;
  if(this.deletedKeys.length === 0
  && this.addedKeys.length === 0) {
    throw new TypeError('You must push deleted keys and added keys in order to get user inputs');
  }
  if(this.deletedKeys.length !== this.addedKeys.length) {
    throw new TypeError('Deleted keys must have same array length as added keys length');
  }
  var callbacks = 0, hasError = false;

  function recurse() {
    var deletedKey = _this.deletedKeys.shift();
    var addedKeys  = _.difference(_this.addedKeys.shift(), _this.migratedKeys);
    _this.getUserInputKey(deletedKey, addedKeys, function(err, newKey, oldKey) {
      if(err) {
        hasError = true;
        return callback(err);
      }
      if(newKey === 'DELETE' && _this.deletedKeys.length !== 0) {
        return recurse();
      }
      else if(newKey === 'DELETE') {
        _this.rl.close();
        callback(null, newTranslations);
      }
      newTranslations = _this.setOldTranslation(newKey, oldKey, newTranslations, oldTranslations);
      if(_this.deletedKeys.length !== 0) {
        return recurse();
      }
      else {
        _this.rl.close();
        callback(null, newTranslations);
      }
    });
  }

  recurse();

};

/**
 * Set old translation on a specfic key
 *
 * @param key {String}
 * @param newTranslation {Object}
 * @param oldTranslation {Object}
 *
 * @return newTranslation {Object}
 */

Update.prototype.setOldTranslation = function(newKey, oldKey, newTranslations, oldTranslations) {
  for(var locale in this.locales) {
    newTranslations[locale][newKey] = oldTranslations[locale][oldKey];
  }
  return newTranslations;
};

/**
 * Get user input update actions.
 *
 * @param files {Array}
 * @private
 */

Update.prototype.getUserInputKey = function(deletedKey, addedKeys, callback) {
  var _this = this;

  if(!this.rl) {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
  }

  var n = 1, _addedKeys = [];

  var question =
    'The key "' + deletedKey + '" is now gone in source\n'
    + 'What do you want to do with it?\n';

  for(var key in addedKeys) {
    question += ('[' + n + ']').cyan + ' - migrate to "' + addedKeys[key].yellow + '"\n';
    _addedKeys.push(addedKeys[key]);
    n++;
  }
  // Add delete option
  question += '[d]'.cyan + ' - ' + 'delete'.red + '\n\n';

  // Address new line problem with three or more options
  if(addedKeys.length > 1) {
    question += '\n';
  }

  this.rl.question(question, function(option) {
    if(/^\d+$/.test(option)
    && +option < _addedKeys.length
    && +option > 0) {
      var migrationKey = _addedKeys[option - 1];
      _this.migratedKeys.push(migrationKey)
      callback(null, migrationKey, deletedKey);
    }
    else if(option === 'd') {
      callback(null, 'DELETE');
    }
  });

  this.rl.on('SIGINT', function() {
    callback({ error: 'SIGINT'});
    _this.rl.close();
  });
};

module.exports = function() {
  var update = new Update;
  update.update();
};

module.exports.Update = Update;