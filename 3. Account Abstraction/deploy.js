import { Account, RpcProvider, json, Contract, cairo, ec } from 'starknet';
import fs from 'fs';
import * as dotenv from 'dotenv';
dotenv.config();

const provider = new RpcProvider({ nodeUrl: 'https://free-rpc.nethermind.io/sepolia-juno' });
const accountAddress = '0x026cc01327ce5ce501eacd860cb8cae6e2c845836a519ef97cc4fe779a461281';
const privateKey = process.env.PRIVATE_KEY;
const account = new Account(provider, accountAddress, privateKey, "1");
//const pubKey = ec.starkCurve.getStarkKey(privateKey); //0x295ae800856ef8bd7954ce34183a5ac1996692f55d47595b65e3466af2ffb21

const compiledERC20Abi = json.parse(
    fs.readFileSync('../2. Crowdfunding/erc20_abi.json').toString('ascii')
);

const compiledAccountAbi = json.parse(
    fs.readFileSync('./account_abi.json').toString('ascii')
);

const ETHAddress = '0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7'; //Starknet Sepolia ETH Contract Address
const tokenContract = new Contract(compiledERC20Abi, ETHAddress, provider);
const accountContract = new Contract(compiledAccountAbi.abi, accountAddress, provider);
tokenContract.connect(account);
accountContract.connect(account);

const balance = await tokenContract.balanceOf(account.address)
//console.log(balance)

async function transferToken(amount, recipient) {
    const amountInWei = cairo.uint256(amount * 10 ** 18);

    const transferCall = tokenContract.populate('transfer',
        [recipient, amountInWei]);
    const tx = await tokenContract.transfer(transferCall.calldata)
    await provider.waitForTransaction(tx.transaction_hash)
}

async function setSpendingLimit(tokenAddress, limit) {
    const limitInWei = cairo.uint256(limit * 10 ** 18);
    const setCall = accountContract.populate('set_spending_limit',
        [tokenAddress, limitInWei]
    );
    const tx = await accountContract.set_spending_limit(setCall.calldata);
    await provider.waitForTransaction(tx.transaction_hash);
}

transferToken(0.00009687, '0x067981c7F9f55BCbdD4e0d0a9C5BBCeA77dAcB42cccbf13554A847d6353F728e');
//transfer_token(1, '0x067981c7F9f55BCbdD4e0d0a9C5BBCeA77dAcB42cccbf13554A847d6353F728e')
//console.log(pubKey);
//setSpendingLimit(ETHAddress, 0.001)

const limit = await accountContract.get_spending_limit(ETHAddress);
console.log(limit)

