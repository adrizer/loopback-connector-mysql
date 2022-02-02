// Copyright IBM Corp. 2015,2016. All Rights Reserved.
// Node module: loopback-connector-mysql
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

'use strict';
const debug = require('debug')('loopback:connector:mysql:transaction');
module.exports = mixinTransaction;

/*!
* @param {MySQL} MySQL connector class
* @param {Object} mysql mysql driver
*/
function mixinTransaction(MySQL, mysql) {
  /**
   * Begin a new transaction
   * @param isolationLevel
   * @param cb
   */
  MySQL.prototype.beginTransaction = function(isolationLevel, cb) {
    debug('Begin a transaction with isolation level: %s', isolationLevel);

    /** @type {import('mysql2').Connection} */
    const client = this.client;

    if (isolationLevel) {
      client.query(
        'SET SESSION TRANSACTION ISOLATION LEVEL ' + isolationLevel,
        function(err, res) {
          if (err) return cb(err);
          client.beginTransaction(function(err) {
            if (err) return cb(err);
            client.query('SET autocommit=0', function(err) {
              if (err) return cb(err);
              return cb(null, client);
            });
          });
        },
      );
    } else {
      client.beginTransaction(function(err) {
        if (err) return cb(err);
        client.query('SET autocommit=0', function(err) {
          if (err) return cb(err);
          return cb(null, client);
        });
      });
    }
  };

  /**
   *
   * @param connection
   * @param cb
   */
  MySQL.prototype.commit = function(connection, cb) {
    debug('Commit a transaction');

    /** @type {import('mysql2').Connection} */
    const client = this.client;

    client.commit(function(err) {
      if (!err) return cb(null);
      if (err) {
        this.rollback(connection, cb);
      }
    });
  };

  /**
   *
   * @param connection
   * @param cb
   */
  MySQL.prototype.rollback = function(connection, cb) {
    debug('Rollback a transaction');

    /** @type {import('mysql2').Connection} */
    const client = this.client;

    client.rollback(function(err) {
      cb(err);
    });
  };
}
