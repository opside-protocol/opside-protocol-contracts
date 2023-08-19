var web3Conn = require('../scripts/util/web3');
var conn = web3Conn.web3Conn();


// console.log(conn.eth.accounts.create());
;(async () => {
const sign = await conn.eth.accounts.signTransaction({to: '0x8626f6940e2eb28930efb4cef49b2d1f2c9c1199', value: "100000000000000000000", gas: 2000000}, process.env.TEST_PV);

console.log(await conn.eth.sendSignedTransaction(sign.rawTransaction))
})()