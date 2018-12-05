# tumblr-backup
Download a backup of your tumblr posts and favorites. This script was developed fairly quickly and may contain some bugs. Let me know if you find any and I'll do my best to fix them as soon as possible.

# Requirements
You need `npm` to run this script.

The easiest way to get `npm` is to download and install [node.js](https://nodejs.org/en/)

# Installation
* Download this repo or from the [releases page](https://github.com/ScopeXL/tumblr-backup/releases).
* Open a command prompt (or terminal window) and navigate to the root folder of this project.
* Run commands
```
npm install
npm start
```

# Instructions
You will be prompted for your tumblr blog name, and if you want to backup your favorites and/or posts.

If you select to backup your favorites, your **Likes/Favorites Page MUST be publically visible!** 

All files follow the naming pattern

`YYYY-MM-DD-HH-mm-ss_BLOGNAME_POSTID_INDEX` and a json is generated with all the post information if that is ever useful in the future

Favorites are stored in the favorites folder, and posts in the posts folder.

Report any bugs in the Issues tab.