const request = require("request-promise").defaults({jar: true});
const settings = require("./settings.json");
const fs = require('fs');
const AsciiTable = require('ascii-table');
const ONE_HOUR = 60 * 60 * 1000;
const baseCommands = {
    get: '/get',
    add: '/add',
    remove: '/remove',
    help: '/help'
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
            description: 'Gets the users with their status, xp and level. **** NOT IMPLEMENTED ****'
        }, 
        getStats: {
            value: `${baseCommands.get} user-stats`,
            description: "Gets a specific user's stats. **** NOT IMPLEMENTED ****",
            args: "{username}"
        }
    },
    help: {
        getHelp: {
            value: baseCommands.help,
            description: 'Get the list of commands and descriptions.'
        }
    }
}
var data;   

const Discord = require('discord.js');
const client = new Discord.Client();

init();

client.login(settings.credentials.discordToken);

client.on('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`);
});

client.on('message', async msg => {
    if (!(msg.content.charAt(0) === '/'))
        return;
    msg.content = msg.content.trim();
    try {
        // games
        if (msg.content === commands.games.getWins.value)
            await getGameWins(msg);
        // users
        else if (msg.content.substring(0, commands.users.addUser.value.length) == commands.users.addUser.value)
            await addUserToList(msg);
        else if (msg.content.substring(0, commands.users.removeUser.value.length) == commands.users.removeUser.value)
            await removeUserFromList(msg);
        // help
        else if (msg.content === '/help')
            await sendHelp(msg);
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
            console.log(game.name);
            tableData.heading.push(game.name);
            await Promise.all(data.users.list.map(user => {
                if (tempMap[user.username] == undefined) {
                    // total wins at first index
                    tempMap[user.username] = [ { totalWins : 0, totalGamesPlayed: 0} ]; 
                }
                if (data.userData[user.username] == undefined || 
                    data.userData[user.username].games == undefined ||
                    data.userData[user.username].games[game.id] == undefined) {
                        console.log('no data');
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
                if (user1.totalGamesPlayed < user2.totalGamesPlayed) {
                    result = 1;
                } else if (user1.totalGamesPlayed > user2.totalGamesPlayed) {
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
        console.log(response);
        msg.reply(response);
        return;
    }
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

//#endregion public


//#region private

async function updateAllUsersGameStats() {
    await Promise.all(data.users.list.map(async (user) => {
        if (data.userData[user.username] != undefined) {
            if (!checkIfUpdateIsRequired(data.userData[user.username].modified)) {
                return;
            }
        }
        console.log(`updating game data for user ${user.username}`);
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
    return now - date1 >= ONE_HOUR;
}

async function login() {
    var url = buildUrl(
        settings.endpoints.login
        .replace('{username}', settings.credentials.username)
        .replace('{loginCode}', settings.credentials.loginCode)
    );
    console.log(`Logging in. Sending request to ${url}`);
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
    console.log('response from get user id: ' + response);
    if (!exists) {
        throw `Error getting user ${username}`;
    }
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
    var now = Date.now() - ONE_HOUR;
    if (fs.existsSync(settings.dataPath)) {
        data = require(settings.dataPath);
    }
    if (data == undefined) {
        data = {};
    }
    if (data.users == undefined) {
        data.users = {
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

