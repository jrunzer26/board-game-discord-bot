const request = require("request-promise").defaults({jar: true});
const settings = require("./settings.json");
const fs = require('fs');
const AsciiTable = require('ascii-table');
const TEN_MINUTES = 60 * 10 * 1000;
const baseCommands = {
    get: '/get',
    add: '/add',
    remove: '/remove',
    help: '/help',
    refresh: '/refresh'
};
const commands = {
    games: {
        getWins :  {
            value: `${baseCommands.get} game-wins`, 
            description: 'Gets the wins for all users/games in the users/games list.'
        },
        getStats: {
            value: `${baseCommands.get} game-stats`,
            description:  'Gets the game stats for all the users. **** NOT IMPLEMENTED ****', 
            args: "{game}"
        },
        addGame: {
            value: `${baseCommands.add} game`,
            description: 'Adds a game to the list. ** NOT IMPLEMENTED **',
            args: '{game}'
        },
        removeGame: {
            value: `${baseCommands.remove} game`,
            description: 'Removes a game from the list. ** NOT IMPLEMENTED **',
            args: '{game}'
        }
    },
    users : {
        addUser: {
            value: `${baseCommands.add} user`,
            description: 'Adds a user to the group.',
            args: '{username}'
        },
        removeUser: {
            value: `${baseCommands.remove} user`,
            description: 'Removes a user from the group.',
            args: '{username}'
        }, 
        getUsers: {
            value: `${baseCommands.get} users`,
            description: 'Gets the users with their status, xp and level.'
        }, 
        getUser: {
            value: `${baseCommands.get} user`,
            description: "Gets a specific user. ** Missing total games played, total games one, etc **",
            args: "{username}"
        }
    },
    help: {
        getHelp: {
            value: baseCommands.help,
            description: 'Get the list of commands and descriptions.'
        }
    },
    admin: {
        refresh: {
            value: baseCommands.refresh,
            description: 'Delete all user/game stats.'
        }
    }
}
var data;   

const Discord = require('discord.js');
const client = new Discord.Client();

init();
//getGame('Carcassonne');

client.login(settings.credentials.discordToken);

client.on('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`);
});

client.on('message', async msg => {
    if (!(msg.content.charAt(0) === '/'))
        return;
    msg.content = msg.content.trim();
    console.log(msg.content);
    console.log(commands.admin.refresh.value);
    try {
        // games
        if (msg.content === commands.games.getWins.value)
            await getGameWins(msg);
        else if (msg.content.substring(0, commands.games.addGame.value.length) == commands.games.addGame.value)
            await addGame(msg, msg.content.substring(commands.users.addGame.value.length + 1));
        else if (msg.content.substring(0, commands.games.removeGame.value.length) == commands.games.removeGame.value)
            await removeGame(msg, msg.content.substring(commands.users.removeGame.value.length + 1));
        // users
        else if (msg.content.substring(0, commands.users.addUser.value.length) == commands.users.addUser.value)
            await addUserToList(msg);
        else if (msg.content.substring(0, commands.users.removeUser.value.length) == commands.users.removeUser.value)
            await removeUserFromList(msg);
        else if (msg.content.substring(0, commands.users.getUsers.value.length) == commands.users.getUsers.value)
            await getUsers(msg);
        else if (msg.content.substring(0, commands.users.getUser.value.length) == commands.users.getUser.value)
            await getUserStats(msg, msg.content.substring(commands.users.getUser.value.length + 1));
        // help
        else if (msg.content === '/help')
            await sendHelp(msg);
        // refresh
        else if (msg.content === commands.admin.refresh.value)
            await refresh(msg);
    }
    catch(err) {
        var error = `Error: ` + err; 
        msg.reply(error);
        console.log(error);
    }
});

//#region public

//#region game
async function getGameWins(msg) {
    if (checkIfUpdateIsRequired(data.stats.wins.modified)) {
        await login();
        console.log('getting game wins');
        await updateAllUsersGameStats();
        var games = [
            { name: "Carcassonne", id: 34 },
            { name: "Wizard", id: 97 }
        ];
        var tableData = {
            title: 'Game Wins',
            heading: [ 'Rank', 'Username', 'Total' ],
            rows: [] 
        };
        var tempMap = {};
        await Promise.all(games.map(async game => {
            tableData.heading.push(game.name);
            await Promise.all(data.users.list.map(user => {
                if (tempMap[user.username] == undefined) {
                    // total wins at first index
                    tempMap[user.username] = [ { totalWins : 0, totalGamesPlayed: 0} ]; 
                }
                if (data.userData[user.username] == undefined || 
                    data.userData[user.username].games == undefined ||
                    data.userData[user.username].games[game.id] == undefined) {
                        tempMap[user.username].push(null);
                        
                } else {
                    
                    var stats = data.userData[user.username].games[game.id];
                    // add to the wins/games played
                    tempMap[user.username][0].totalWins += stats.wins;
                    tempMap[user.username][0].totalGamesPlayed += stats.amount;
                    // create the formatted string for the cell
                    var formattedString = `w:${stats.wins} gp:${stats.amount}`;               
                    tempMap[user.username].push(formattedString);
                }
            }));
        }));
        var keys = Object.keys(tempMap);
        keys.sort(function(user1, user2) {
            var result = 1;
            user1 = tempMap[user1][0];
            user2 = tempMap[user2][0];
            if (user1.totalWins > user2.totalWins) {
                result = 1;
            } else if (user1.totalWins == user2.totalWins) {
                if (user1.totalGamesPlayed > user2.totalGamesPlayed) {
                    result = 1;
                } else if (user1.totalGamesPlayed < user2.totalGamesPlayed) {
                    result = -1;
                } else {
                    result = 0;
                }
            } else {
                result = -1;
            }
            return -result;
        });
        var rank = 1;
        await Promise.all(keys.map(async key => {
            var row = [ rank++, key ];
            var data = Object.values(tempMap[key]);
            var totals = data.shift();
            row.push(`w:${totals.totalWins} gp:${totals.totalGamesPlayed}`);
            row.push.apply(row, data);
            tableData.rows.push(row);
        }));
        data.stats.wins = {
            modified: Date.now(),
            data: tableData
        }
        await saveData();
    }
    var response = AsciiTable.factory(data.stats.wins.data).toString();
    if (msg != undefined)
        msg.reply(formatMsg(response));
    
}
/*
async function addGame(msg, gameName) {
    if (msg == undefined) {
        return;
    }
    if (!msg.member.roles.cache.some(r => r.name === "mods")) {
        throw 'You must be a mod to do this. Get REKT m8'
    }
    if (game.lengh < 1) {
        throw `Must specific a game in command ${commands.games.addGame.value} {game}`;
    }
    if (await checkIfGameExists(game)) {
        var response = `${game} already exists`;
        msg.reply(response);
        return;
    }
    await login();
    console.log(`Adding a new game to the list: ${game}`);
    var game = await getGame(gameName);
    console.log(game);
}
*/
//#endregion

//#region user
async function addUserToList(msg) {
    if (msg == undefined) {
        return;
    }
    if (!msg.member.roles.cache.some(r => r.name === "mods")) {
        throw 'You must be a mod to do this. Get REKT m8'
    }
    var username = msg.content.substring(commands.users.addUser.value.length + 1);
    
    if (username.length < 1) {
        throw `Must specify username in command: ${commands.users.addUser.value} {username}`;
    }
    if ((await checkIfUserExists(username))) {
        var response  = `${username} already exists`;
        msg.reply(response);
        return;
    }
    await login();
    console.log(`Adding new user to the list: ${username}`);
    var user = await getUserId(username);
    data.users.list.push({
        username: username,
        id: user.id
    });
    if (msg != undefined) {
        msg.reply(`Added ${username} to the list`);
    }
    await saveData();
}

async function removeUserFromList(msg) {
    if (msg == undefined) {
        return;
    }
    if (!msg.member.roles.cache.some(r => r.name === "mods")) {
        throw 'You must be a mod to do this. Get REKT m8'
    }
    var username = msg.content.substring(commands.users.removeUser.value.length + 1);
    
    if (username.length < 1) {
        throw `Must specify username in command: ${commands.users.removeUser.value} {username}`;
    }
    var newList = [];
    var response;
    await data.users.list.forEach(user => {
        if (user.username == username) {
            data.userData[username] = undefined;
            response = `Successfully removed user ${username}`;
        } else {
            newList.push(user);
        }
    });
    data.users.list = newList;
    data.users.modified = Date.now();
    msg.reply(response);   
    await saveData();
}

async function getUserStats(msg, username) {
    if (username.length < 1) {
        throw `Must specify username in command: ${commands.users.getUser.value} {username}`;
    }
    if (data.userData[username] == undefined) {
        data.userData[username] = {};
    }
    if (data.userData[username].stats == undefined) {
        data.userData[username].stats = {
            modified: Date.now() - TEN_MINUTES,
            info: {},
            userStatsTable: {}
        }
    }
    if (checkIfUpdateIsRequired(data.userData[username].stats.modified)) {
        if (msg != null) await login();
        var userInfo = await getUserInfo(username);
        var userStatus = await getUserId(username);
        data.userData[username].stats.info = {
            level: userInfo.header.level,
            xp: userInfo.header.rechte,
            levelProgress: userInfo.header.level_progress,
            lastAction: userInfo.header.lastAction,
            status: userStatus.status
        };
        data.userData[username].stats.modified = Date.now();
        var info = data.userData[username].stats.info;
        var tableData = {
            title: `${username} Stats`,
            heading: [ 'Level', 'Xp', 'Progress', "Last Action", "Status" ],
            rows: [ [info.level, info.xp, info.levelProgress, info.lastAction, info.status ] ]
        };
        data.userData[username].stats.userStatsTable = tableData;
        if (msg != null) await saveData();
    }
    if (msg != undefined) {
        msg.reply(formatMsg(AsciiTable.factory(data.userData[username].stats.userStatsTable)));
    }
}

async function getUsers(msg) {
    if (checkIfUpdateIsRequired(data.stats.users.modified)) {
        await login();
        await Promise.all(data.users.list.map(async user => {
            await getUserStats(null, user.username);
        }));
        var tableData = {
            title: `User Stats`,
            heading: [ 'Rank', 'Username', 'Level', 'Xp', 'Progress', "Last Action", "Status" ],
            rows: []
        };
        var sortedUsers = data.users.list.sort(function(user1, user2) {
            var user1Xp = data.userData[user1.username].stats.info.xp;
            var user2Xp = data.userData[user2.username].stats.info.xp;
            console.log(user1Xp + " " + user2Xp );
            var compareVal = 0;
            if (user1Xp > user2Xp) 
                compareVal = 1;
            else if (user1Xp < user2Xp ) 
                compareVal = -1;
            return -compareVal;
        });
        var rank = 1;
        await Promise.all(sortedUsers.map(user => {
            var row = [ rank++, user.username ];
            console.log(data.userData[user.username].stats.userStatsTable.rows[0]);
            row.push.apply(row, data.userData[user.username].stats.userStatsTable.rows[0]);
            console.log(row);
            tableData.rows.push(row);
        }));
        data.stats.users.data = tableData;
        data.stats.users.modified = Date.now();
        await saveData();
    }
    console.log(formatMsg(AsciiTable.factory(data.stats.users.data)));
    if (msg != undefined) {
        msg.reply(formatMsg(AsciiTable.factory(data.stats.users.data)));
    }

}

//#endregion

//#region help
async function sendHelp(msg) {
    if (msg == undefined) return;
    var response = "\n**Commands**";
    var commandKeys = Object.keys(commands);
    await Promise.all(commandKeys.map(async key => {
        response += `\n\n**${key}**`;
        await Promise.all(Object.keys(commands[key]).map(async routeKey => {
            var route = commands[key][routeKey];
            response += `\n${route.value} `;
            if (route.args != undefined) {
                response += route.args;
            }
            response += ` - ${route.description}`;
        }));
    }));
    msg.reply(response);
}
//#endregion

//#region refresh
async function refresh(msg) {
    if (msg == undefined) return;
    var response = "\nDeleted all stats.";
    data.userData = undefined;
    data.stats = undefined;
    await init();
    await saveData();
    msg.reply(response);
}
//#endregion

//#endregion public


//#region private

async function updateAllUsersGameStats() {
    await Promise.all(data.users.list.map(async (user) => {
        if (data.userData[user.username] != undefined && data.userData[user.username].games != undefined && data.userData[user.username].games.modified != undefined) {
            if (!checkIfUpdateIsRequired(data.userData[user.username].games.modified)) {
                return;
            }
        }
        var gameStats = await getGameStats(user);
        data.userData[user.username] = {
            modified: Date.now(),
            games: {}
        };
        await Promise.all(gameStats.data.map(async (game) => {
            data.userData[user.username].games[game.gameid] = game.game;
        }));
    }));
}

function checkIfUpdateIsRequired(modified) {
    var now = new Date(Date.now());
    var date1 = new Date(modified);
    return now - date1 >= TEN_MINUTES;
}

async function login() {
    var url = buildUrl(
        settings.endpoints.login
        .replace('{username}', settings.credentials.username)
        .replace('{loginCode}', settings.credentials.loginCode)
    );
    console.log('Logging in');
    var response = await request({ 
        uri: url,
        json: true
    });
    if (response == undefined || response.login != 'done') {
        var error = 'Unable to login';
        console.log(error);
        console.log(response);
        throw error;
    }
    return response;
}

function formatMsg(content) {
    return `\`\`\`\n${content}\`\`\``;
}

async function logout() {

}

function buildUrl(query) {
    var endpoints = settings.endpoints;
    return `${endpoints.host}${endpoints.baseApiPath}${query}`;
}

async function getUserId(username) {
    var url = buildUrl(
        settings.endpoints.user.getId
        .replace('{username}', username)
    );
    console.log(`Getting user id for user ${username}. Sending request to ${url}`);
    var response = await request({ 
        uri: url,
        json: true
    });
    // check if error
    if (response == undefined || response.status != 'OK') {
        var error = `Unable to find user id for user ${username}`;
        console.log(error);
        console.log(response);
        throw error;
    }
    // check if user exists
    if (response.data == undefined) {
        console.log(response);
        throw 'Error getting user';
    }  
    var exists = false;
    var response;
    await Promise.all(response.data.map(userDetails => {
        if (userDetails.val === username) {
            exists = true;
            response = userDetails;
            console.log(response);
        }
    }));
    if (!exists) {
        throw `Error getting user ${username}`;
    }
    return response;
}
/*
async function getGame(gameName) {
    await login();
    var url = buildUrl(settings.endpoints.game.getGame
        .replace('{gameName}', gameName));
    console.log(`Getting game: ${gameName}. Sending request to ${url}`);
    var response = await request({ 
        uri: url,
        json: true
    });
    console.log(response);
    // check if error
    if (response == undefined || response.status != 'OK') {
        var error = `Unable to find game: ${gameName}`;
        console.log(error);
        console.log(response);
        throw error;
    }
    // check if user exists
    if (response.data == undefined) {
        console.log(response);
        throw 'Error getting game';
    }  
    var gameData = JSON.parse(response.data);
    console.log(gameData);
    var response;
    /*
    if (!exists) {
        throw `Error getting user ${username}`;
    }

    return response;
}
*/

async function getUserInfo(username) {
    var url = buildUrl(
        settings.endpoints.user.getUserInfo
        .replace('{username}', username)
    );
    console.log(`Getting user id for user ${username}. Sending request to ${url}`);
    var response = await request({ 
        uri: url,
        json: true
    });
    // check if error
    if (response == undefined || response.status != 'OK') {
        var error = `Unable to find user id for user ${username}`;
        console.log(error);
        console.log(response);
        throw error;
    }
    if (response.data == undefined) {
        console.log(response);
        throw 'Error getting user info';
    }  
    var response = JSON.parse(response.data);
    console.log('response from get user id: ' + response);
    return response;
}



async function checkIfUserExists(username) {
    var exists = false;
    await data.users.list.forEach(user => {
        if (user.username == username) {
            exists = true;
        }
    });
    return exists;
}

/*
async function checkIfGameExists(gameName) {
    var exists = false;
    await data.games.list.forEach(game => {
        if (game.name == gameName) {
            exists = true;
        }
    });
    return exists;
}
*/

async function saveData() {
    try {
        console.log('Saving data');
        fs.writeFileSync(settings.dataPath, JSON.stringify(data));
    } catch (err) {
        var error = `Error saving data`;
        console.log(err);
        throw error;
    }
}

async function init() {
    console.log('init');
    var now = Date.now() - TEN_MINUTES;
    if (fs.existsSync(settings.dataPath)) {
        data = require(settings.dataPath);
    }
    if (data == undefined) {
        data = {};
    }
    if (data.users == undefined) {
        data.users = {
            modified : now,
            map: {}
        }
    }
    if (data.games == undefined) {
        data.games = {
            modified : now,
            list : []
        }
    }
    if (data.userData == undefined) {
        data.userData = {}
    }
    if (data.stats == undefined) {
        data.stats = {
            modified : now,
            wins: {
                modified : now
            },
            games : {
                modified: now
            },
            users: {
                modified: now
            }
        };
    }
    return Promise.resolve();
}

async function getGameStats(user) {
    var url = buildUrl(
        settings.endpoints.user.getGameStats
        .replace('{userId}', user.id)
    );
    console.log(`Getting game stats for user ${user.username}:${user.id}. Sending request to ${url}`);
    var response = await request({ 
        uri: url,
        json: true
    });
    // check if error
    if (response == undefined || response.status != 'OK') {
        var error = `Unable to get gamestats for user ${user.username}:${user.id}`;
        console.log(error);
        console.log(response);
        throw error;
    }
    //console.log('response from get user game stats: ' + response);
    return response;
}

//#endregion

