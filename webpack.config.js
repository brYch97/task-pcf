const getBuildMode = () => {
    const cliArgs = process.argv;
    const indexOfMode = cliArgs.findIndex(x => x.includes("--buildMode"));
    return cliArgs[indexOfMode + 1].replaceAll("\"", "");
};

const customConfig = {
    // watch: true, // uncomment this line to enable webpack watch mode
    devtool: getBuildMode() === "production" ? false : "inline-source-map",
    resolve: {
        alias: {
            'react-dom/server': 'react-dom/server.js'
        }
    },
};
module.exports = customConfig;