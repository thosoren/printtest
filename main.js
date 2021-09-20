const electron = require('electron');
const url = require('url');
const path = require('path');



//Set ENV
process.env.NODE_ENV = 'development';
 
const {app, BrowserWindow, Menu, ipcMain} = electron;

let mainWindow;


app.on('ready',function() {
 	//Create new window
 	mainWindow = new BrowserWindow({
 		webPreferences: {
            nodeIntegration: true
        }
 	});
 	//Load html into window
 	mainWindow.loadURL(url.format({
 		pathname: path.join(__dirname,'mainWindow.html'),
 		protocol:'file',
 		slashes: true
 	}));

 	mainWindow.on('closed', function() {
 		app.quit();
 	});

 	//mainWindow.webContents.openDevTools();

});