const _ = require('lodash');
const axios = require('axios');
const moment = require('moment');
const request = require('request');
const inquirer = require('inquirer');
const fs = require('fs');
const path = require('path');

const favoriteIds = [];
const postIds = [];
let downloadQueue = [];
let isDownloading = false;
let totalFavorites = 0;
let totalPosts = 0;
let favoritesOffset = 0;
let postsOffset = 0;
let favoritesFinished = false;
let postsFinished = false;

let blogName;
let backupFavorites;
let backupPosts;

inquirer
  .prompt(getQuestions())
  .then(answers => {
    blogName = answers.blogName;
    backupFavorites = answers.getFavorites;
    backupPosts = answers.getPosts;

    if (!blogName) {
      console.error('No blog name set!');
      return;
    }

    if (backupFavorites) {
      // Start fetching favorites
      startFavorites();
    } else {
      // Do not get favorites
      if (backupPosts) {
        // Start fetching posts
        startPosts();
      }
    }
  });

// Get questions to prompt the user with on load
function getQuestions() {
  return [
    {
      type: 'input',
      name: 'blogName',
      message: 'What is your tumblr blog username?'
    },
    {
      type: 'confirm',
      name: 'getPosts',
      message: 'Do you want to backup your posts?'
    },
    {
      type: 'confirm',
      name: 'getFavorites',
      message: 'Do you want to backup your favorites?'
    }
  ];
}

function startFavorites() {
  getFavorites().then((data) => {
    totalFavorites = data.total;

    // console.log(`${totalFavorites} Favorites Found!`);
    
    // Start downloading
    setTimeout(dequeue, 2000);
  }).catch((err) => {
    console.error(err);
  });
}

function startPosts() {
  getPosts().then((data) => {
    totalPosts = data.total;

    // console.log(`${totalPosts} Posts Found!`);
    
    // Start downloading
    setTimeout(dequeue, 2000);
  }).catch((err) => {
    console.error(err);
  });
}

function getRandomInterval() {
  return _.random(300, 800);
}

function dequeue() {
  if (downloadQueue.length <= 0 || isDownloading) {
    // Nothing left to dequeue
    return;
  }

  isDownloading = true;

  const item = downloadQueue[0];

  // console.log(`${downloadQueue.length} items left to download`);
  // console.log(`Downloading ${item.imageUrl}`);

  download(item.imageUrl, item.fileName, item.folder).then((data) => {
    console.log(`${downloadQueue.length} | Downloaded ${item.folder === 'favorites' ? 'Favorite' : 'Post'} ${data.path}`);

    isDownloading = false;

    // Remove item from queue
    downloadQueue = _.without(downloadQueue, item);

    setTimeout(dequeue, getRandomInterval());
  }).catch((err) => {
    console.error(err);
  });
}

function getFavorites() {
  return new Promise((resolve, reject) => {
    axios.get(`https://api.tumblr.com/v2/blog/${blogName}.tumblr.com/likes`, {
      params: {
        api_key: 'mi8xbS9xSvfcYtwqgBPyNpKUMlxADMGmriquwZe9tWh6mYhSGy',
        reblog_info: false,
        notes_info: false,
        limit: 20,
        offset: favoritesOffset,
      }
    })
    .then((response) => {
      const posts = _.get(response, 'data.response.liked_posts', []);
      const total = _.get(response, 'data.response.liked_count', 0);
      let totalQueued = 0;
      favoritesBeforeTimestamp = _.get(response, 'data.response._links.next.query_params.before', 0);

      // Favorites
      const favorites = posts;

      _.each(favorites, (favorite) => {
        const postTimestamp = new moment(favorite.timestamp * 1000).format('YYYY-MM-DD-HH-mm-ss');

        if (favoriteIds.includes(favorite.id)) {
          // Already scanned this favorite (assume we are at the end)
          // console.log('ALREADY SCANNED', favorite.id);
          favoritesFinished = true;
          return;
        }

        // Add favorite ID to scanned list
        favoriteIds.push(favorite.id);

        switch (favorite.type) {
          case 'text':
            const body = _.get(favorite, 'body', '');
            const imageUrls = body.match(/(http(s?):)([/|.|\w|\s|-])*\.(?:jpg|gif|png)/g);
            
            _.each(imageUrls, (imageUrl, index) => {
              const fileName = `${postTimestamp}_${favorite.blog_name}_${favorite.id}_${index}`;

              downloadQueue.push({
                imageUrl,
                fileName,
                folder: 'favorites',
              });
              totalQueued += 1;
            });
            break;

          case 'photo':
            if (favorite.photos) {
              _.each(favorite.photos, (photo, index) => {
                const imageUrl = _.get(photo, 'original_size.url', null);
                const fileName = `${postTimestamp}_${favorite.blog_name}_${favorite.id}_${index}`;

                downloadQueue.push({
                  imageUrl,
                  fileName,
                  folder: 'favorites',
                });
                totalQueued += 1;
              });
            } else {
              console.log(`-- Post ID: ${favorite.id} has no photos`);
            }
            break;

          case 'video':
            const videoUrl = _.get(favorite, 'video_url', null);
            const fileName = `${postTimestamp}_${favorite.blog_name}_${favorite.id}`;

            if (videoUrl) {
              downloadQueue.push({
                imageUrl: videoUrl,
                fileName,
                folder: 'favorites',
              });
              totalQueued += 1;
            } else {
              console.log(`-- Post ID: ${favorite.id} has no video url`);
            }
            break;

          default:
            console.error('Unable to download post of type ' + favorite.type);
            break;
        }

        const favoriteFileName = `${postTimestamp}_${favorite.blog_name}_${favorite.id}_info.json`;
        // Write the favorite json
        fs.writeFile(path.resolve(__dirname, `./favorites/${favoriteFileName}`), JSON.stringify(favorite, null, 2), 'utf8', () => {
          // console.log(`Wrote ${favoriteFileName}`);
        });
      });

      // Start downloading if queue is stopped
      if (downloadQueue.length <= 0) {
        setTimeout(dequeue, getRandomInterval());
      }

      // console.log(`Added ${totalQueued} items to download queue`);
      console.log(`Scanned ${favoriteIds.length} Favorites`);

      // Queue next favorites fetch
      favoritesOffset += 20;

      // console.log(`Offset: ${favoritesOffset}`);
      // console.log(`Favorites On Fetch: ${favorites.length}`);
      // console.log(`First Favorite ID: ${favorites[0].id}`);

      if (!favoritesFinished) {
        // Only queue next request if the favorites aren't finished
        setTimeout(() => {
          getFavorites();
        }, 5000);
      } else {
        // Favorites finished, start backing up posts (if set)
        if (backupPosts) {
          // Start fetching posts
          startPosts();
        }
      }

      resolve({
        posts,
        total
      });
    })
    .catch(function (error) {
      reject(error);
    });
  });
}

function getPosts() {
  return new Promise((resolve, reject) => {
    axios.get(`https://api.tumblr.com/v2/blog/${blogName}.tumblr.com/posts`, {
      params: {
        api_key: 'mi8xbS9xSvfcYtwqgBPyNpKUMlxADMGmriquwZe9tWh6mYhSGy',
        reblog_info: false,
        notes_info: false,
        limit: 20,
        offset: postsOffset,
      }
    })
    .then((response) => {
      const posts = _.get(response, 'data.response.posts', []);
      const total = _.get(response, 'data.response.total_posts', 0);
      let totalQueued = 0;
      // favoritesBeforeTimestamp = _.get(response, 'data.response._links.next.query_params.before', 0);

      // Posts
      _.each(posts, (post) => {
        const postTimestamp = new moment(post.timestamp * 1000).format('YYYY-MM-DD-HH-mm-ss');

        if (postIds.includes(post.id)) {
          // Already scanned this favorite (assume we are at the end)
          // console.log('ALREADY SCANNED', favorite.id);
          postsFinished = true;
          return;
        }

        // Add favorite ID to scanned list
        postIds.push(post.id);

        switch (post.type) {
          case 'text':
            const body = _.get(post, 'body', '');
            const imageUrls = body.match(/(http(s?):)([/|.|\w|\s|-])*\.(?:jpg|gif|png)/g);
            
            _.each(imageUrls, (imageUrl, index) => {
              const fileName = `${postTimestamp}_${post.blog_name}_${post.id}_${index}`;

              downloadQueue.push({
                imageUrl,
                fileName,
                folder: 'posts',
              });
              totalQueued += 1;
            });
            break;

          case 'photo':
            if (post.photos) {
              _.each(post.photos, (photo, index) => {
                const imageUrl = _.get(photo, 'original_size.url', null);
                const fileName = `${postTimestamp}_${post.blog_name}_${post.id}_${index}`;

                downloadQueue.push({
                  imageUrl,
                  fileName,
                  folder: 'posts',
                });
                totalQueued += 1;
              });
            } else {
              console.log(`-- Post ID: ${post.id} has no photos`);
            }
            break;

          case 'video':
            const videoUrl = _.get(post, 'video_url', null);
            const fileName = `${postTimestamp}_${post.blog_name}_${post.id}`;

            if (videoUrl) {
              downloadQueue.push({
                imageUrl: videoUrl,
                fileName,
                folder: 'posts',
              });
              totalQueued += 1;
            } else {
              console.log(`-- Post ID: ${post.id} has no video url`);
            }
            break;

          default:
            console.error('Unable to download post of type ' + post.type);
            break;favorite
        }

        const postFileName = `${postTimestamp}_${post.blog_name}_${post.id}_info.json`;
        // Write the favorite json
        fs.writeFile(path.resolve(__dirname, `./posts/${postFileName}`), JSON.stringify(post, null, 2), 'utf8', () => {
          // console.log(`Wrote ${postFileName}`);
        });
      });

      // Start downloading if queue is stopped
      if (downloadQueue.length <= 0) {
        setTimeout(dequeue, getRandomInterval());
      }

      // console.log(`Added ${totalQueued} items to download queue`);
      console.log(`Scanned ${postIds.length} Posts`);

      // Queue next favorites fetch
      postsOffset += 20;

      // console.log(`Offset: ${favoritesOffset}`);
      // console.log(`Favorites On Fetch: ${favorites.length}`);
      // console.log(`First Favorite ID: ${favorites[0].id}`);

      if (!postsFinished) {
        // Only queue next request if the posts aren't finished
        setTimeout(() => {
          getPosts();
        }, 5000);
      }

      resolve({
        posts,
        total
      });
    })
    .catch(function (error) {
      reject(error);
    });
  });
}

function download(uri, fileName, folder) {
  return new Promise((resolve, reject) => {
    request.head(uri, {timeout: 5000}, (err, res, body) => {
      // console.log('content-type:', res.headers['content-type']);
      // console.log('content-length:', res.headers['content-length']);
      if (err && err.code === 'ETIMEDOUT') {
        console.log('Request Timed Out');
        resolve('ETIMEDOUT');
        return;
      }

      if (_.isUndefined(res)) {
        // No response headers were returned
        console.log('No Response');
        // deferred.reject('res:headers', res);
        deferred.resolve('ETIMEDOUT');
        return;
      }

      var filetype;

      switch (res.headers['content-type']) {
        case 'image/jpeg':
          filetype = 'jpg';
          break;
        case 'image/gif':
          filetype = 'gif';
          break;
        case 'image/png':
          filetype = 'png';
          break;
        case 'video/mp4':
          filetype = 'mp4';
          break;
        default:
          filetype = 'jpg';
          break;
      }

      request(uri).pipe(
        fs.createWriteStream(path.join(__dirname, folder, `${fileName}.${filetype}`))
      ).on('close', () => {
        resolve({
          path: path.join(__dirname, folder, `${fileName}.${filetype}`),
          filetype: filetype
        });
      }).on('error', (err) => {
        reject(err);
      });
    });
  });
}