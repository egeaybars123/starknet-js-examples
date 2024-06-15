import { Account, RpcProvider, json, Contract, cairo } from 'starknet';
import fs from 'fs';
import * as dotenv from 'dotenv';
dotenv.config();

const provider = new RpcProvider({ nodeUrl: 'https://starknet-sepolia.public.blastapi.io' });
const accountAddress = '0x067981c7F9f55BCbdD4e0d0a9C5BBCeA77dAcB42cccbf13554A847d6353F728e';
const privateKey = process.env.PRIVATE_KEY;

const account = new Account(provider, accountAddress, privateKey, "1");

const compiledERC20Abi = json.parse(
    fs.readFileSync('./erc20_abi.json').toString('ascii')
);

const tokenAddress = '0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7';
const tokenContract = new Contract(compiledERC20Abi, tokenAddress, provider);

let balance = await tokenContract.balanceOf(accountAddress);
console.log("Balance of ETH:", balance.toString())

const crowdfundingAddr = '0x04a11f2c742045966745dd66c69dd24555c95df1167fc153d7915af5a75ca9f9';
const approvedAmount = 0.001;
const approvedAmountInDecimals = cairo.uint256(approvedAmount * 10 ** 18);;
tokenContract.connect(account);

console.log("Approve Amount", approvedAmountInDecimals)

/*
const myCall = tokenContract.populate('approve', [crowdfundingAddr, approvedAmountInDecimals]);
const res = await tokenContract.approve(myCall.calldata);
await provider.waitForTransaction(res.transaction_hash);

console.log('Approved the contract for', approvedAmount, 'ETH');
*/

/*
const compiledCrowdfundingAbi = json.parse(
    fs.readFileSync('./crowdfunding_abi.json').toString('ascii')
);

const crowdfundingContract = new Contract(compiledCrowdfundingAbi.abi, crowdfundingAddr, provider);
crowdfundingContract.connect(account);

const transferCall = crowdfundingContract.populate('transfer_tokens', [tokenAddress, approvedAmountInDecimals]);
const transfer_tx = await crowdfundingContract.transfer_tokens(transferCall.calldata);
await provider.waitForTransaction(transfer_tx.transaction_hash);

console.log('Transferred', approvedAmount, 'ETH');

*/