const { configureConnector, getFreshToken } = require ('./src/connector-wrapper')
const { isTokenExpired, decodeToken } = require('./src/token')

module.exports = {
    configureConnector,
    getFreshToken,
    isTokenExpired,
    decodeToken
}
