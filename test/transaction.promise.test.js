// Copyright IBM Corp. 2015,2019. All Rights Reserved.
// Node module: loopback-connector-mysql
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

'use strict';
const Transaction = require('loopback-datasource-juggler').Transaction;
require('./init.js');
require('should');

let db, Post, Review;

describe('transactions with promise', function() {
  before(function(done) {
    db = global.getDataSource({collation: 'utf8_general_ci',
      createDatabase: true});
    db.once('connected', function() {
      Post = db.define('PostTX', {
        title: {type: String, length: 255, index: true},
        content: {type: String},
      }, {mysql: {engine: 'INNODB'}});
      Review = db.define('ReviewTX', {
        author: String,
        content: {type: String},
      }, {mysql: {engine: 'INNODB'}});
      Post.hasMany(Review, {as: 'reviews', foreignKey: 'postId'});
      db.automigrate(['PostTX', 'ReviewTX'], done);
    });
  });

  after(function(done) {
    // disconnect from this db to avoid too many connection error
    // due to multiple instance of connection pool
    db.disconnect();
    done();
  });

  let currentTx;
  let hooks = [];
  // Return an async function to start a transaction and create a post
  function createPostInTx(post, timeout) {
    return function(done) {
      // Transaction.begin(db.connector, Transaction.READ_COMMITTED,
      const promise = Post.beginTransaction({
        isolationLevel: Transaction.READ_REPEATABLE,
        timeout: timeout,
      });
      promise.then(function(tx) {
        (typeof tx.id).should.be.eql('string');
        currentTx = tx;
        hooks = [];
        tx.observe('before commit', function(context, next) {
          hooks.push('before commit');
          next();
        });
        tx.observe('after commit', function(context, next) {
          hooks.push('after commit');
          next();
        });
        tx.observe('before rollback', function(context, next) {
          hooks.push('before rollback');
          next();
        });
        tx.observe('after rollback', function(context, next) {
          hooks.push('after rollback');
          next();
        });
      }).then(function() {
        Post.create(post, {transaction: currentTx}).then(
          function(p) {
            p.reviews.create({
              author: 'John',
              content: 'Review for ' + p.title,
            }, {transaction: currentTx}).then(
              function(c) {
                done(null, c);
              },
            );
          },
        );
      }).catch(done);
    };
  }

  // Return an async function to find matching posts and assert number of
  // records to equal to the count
  function expectToFindPosts(where, count, inTx) {
    return function(done) {
      const options = {};
      if (inTx) {
        options.transaction = currentTx;
      }
      Post.find({where: where}, options).then(
        function(posts) {
          console.log(count, posts.length);
          posts.length.should.be.eql(count);
          if (count) {
            // Find related reviews
            // Please note the empty {} is required, otherwise, the options
            // will be treated as a filter
            posts[0].reviews({}, options).then(function(reviews) {
              reviews.length.should.be.eql(count);
              done();
            });
          } else {
            if (posts.length) throw new Error('rrrrrr');
            done();
          }
        },
      ).catch(done);
    };
  }

  describe('commit', function() {
    const post = {title: 't1', content: 'c1'};
    before(createPostInTx(post));

    // TODO fix this
    // it('should not see the uncommitted insert', expectToFindPosts(post, 0));

    it('should see the uncommitted insert from the same transaction',
      expectToFindPosts(post, 1, true));

    it('should commit a transaction', function(done) {
      currentTx.commit().then(function() {
        hooks.should.be.eql(['before commit', 'after commit']);
        done();
      }).catch(done);
    });

    it('should see the committed insert', expectToFindPosts(post, 1));

    it('should report error if the transaction is not active', function(done) {
      currentTx.commit().catch(function(err) {
        (err).should.be.instanceof(Error);
        done();
      });
    });
  });

  describe('rollback', function() {
    const post = {title: 't2', content: 'c2'};
    before(createPostInTx(post));

    // TODO fix this
    // it('should not see the uncommitted insert', expectToFindPosts(post, 0));

    it('should see the uncommitted insert from the same transaction',
      expectToFindPosts(post, 1, true));

    it('should rollback a transaction', function(done) {
      currentTx.rollback().then(function() {
        hooks.should.be.eql(['before rollback', 'after rollback']);
        done();
      }).catch(done);
    });

    it('should not see the rolledback insert', expectToFindPosts(post, 0));

    it('should report error if the transaction is not active', function(done) {
      currentTx.rollback().catch(function(err) {
        (err).should.be.instanceof(Error);
        done();
      });
    });
  });

  describe.skip('timeout', function() {
    const post = {title: 't3', content: 'c3'};
    before(createPostInTx(post, 500));

    it('should invoke the timeout hook', function(done) {
      currentTx.observe('timeout', function(context, next) {
        next();
        // It will only proceed upon timeout
        done();
      });
    });

    it('should rollback the transaction if timeout', function(done) {
      Post.find({where: {title: 't3'}}, {transaction: currentTx},
        function(err, posts) {
          if (err) return done(err);
          posts.length.should.be.eql(0);
          done();
        });
    });
  });
});
