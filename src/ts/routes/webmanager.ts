import path = require("path");
import { RouteInitEnvironment } from "./shared/env";

export const addRoutes = (env: RouteInitEnvironment) => {

    const webManagerDir = `/webmanager/`;

    // Add redirect from root to webmanager
    env.app.get('/', (req, res) => {
        res.redirect(webManagerDir);
    });

    // Serve static files from webmanager directory
    env.app.get(`${webManagerDir}*`, (req, res) => {
        const filePath = req.path.slice(webManagerDir.length);
        const assetsPath = path.resolve(__dirname, '../webmanager');
        if (filePath.length === 0) {
            // Send default file
            res.sendFile(assetsPath + '/index.html');
        }
        else {
            res.sendFile(assetsPath + '/' + filePath);
        }
    });    

};

export default addRoutes;