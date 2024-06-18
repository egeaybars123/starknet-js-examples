import { Account, RpcProvider, json, Contract, cairo, shortString } from 'starknet';
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

const compiledCrowdFundAbi = json.parse(
    fs.readFileSync('./crowdfunding_abi.json').toString('ascii')
);

//Initialize contract objects - Crowdfunding and ETH contract (for approving ETH to transfer to our contract)
const ETHAddress = '0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7'; //Starknet Sepolia ETH Contract Address
const tokenContract = new Contract(compiledERC20Abi, ETHAddress, provider);
const crowdfundingAddr = '0x06c53826b627f586469c4c983f420906cf94aedf1fb9c867accca15a53edac73';
const crowdfundingContract = new Contract(compiledCrowdFundAbi.abi, crowdfundingAddr, provider);

tokenContract.connect(account);
crowdfundingContract.connect(account);

async function createCampaign(name, beneficiary, tokenAddress, goal) {
    const goalInWei = cairo.uint256(goal * 10 ** 18);
    const felt_name = shortString.encodeShortString(name)
    const createCall = crowdfundingContract.populate('create_campaign',
        [felt_name, beneficiary, tokenAddress, goalInWei])
    const tx = await crowdfundingContract.create_campaign(createCall.calldata)
    await provider.waitForTransaction(tx.transaction_hash)
    console.log('Created ', name, 'campaign');
}

async function contribute(campaign_no, amount) {
    const amountInWei = cairo.uint256(amount * 10 ** 18);

    const approveCall = tokenContract.populate('approve',
        [crowdfundingAddr, amountInWei]);
    const contributeCall = crowdfundingContract.populate('contribute',
        [campaign_no, amountInWei]);

    const multiCall = await account.execute([
        {
            contractAddress: ETHAddress,
            entrypoint: 'approve',
            calldata: approveCall.calldata,
        },
        {
            contractAddress: crowdfundingAddr,
            entrypoint: 'contribute',
            calldata: contributeCall.calldata,
        },
    ], compiledCrowdFundAbi);

    await provider.waitForTransaction(multiCall.transaction_hash);
    console.log('Contributed to the campaign_no ', campaign_no);
}

async function getFunderContribution(campaign_no, funder_addr) {
    const identifier_hash = await crowdfundingContract.get_funder_identifier(campaign_no, funder_addr);
    const contribution = await crowdfundingContract.get_funder_contribution(identifier_hash);
    console.log('Funder Contribution: ', contribution.toString());
}

async function getLatestCampaignNo() {
    const campaign_no = await crowdfundingContract.get_latest_campaign_no();
    console.log('Current campaign no: ', campaign_no.toString());
}

async function withdrawContribution(campaign_no) {
    const withdrawCall = crowdfundingContract.populate('withdraw_contribution',
        [campaign_no])
    const tx = await crowdfundingContract.withdraw_contribution(withdrawCall.calldata)
    await provider.waitForTransaction(tx.transaction_hash)
    console.log('Withdrew from campaign_no ', campaign_no);
}

async function withdrawFunds(campaign_no) {
    const withdrawCall = crowdfundingContract.populate('withdraw_funds',
        [campaign_no])
    const tx = await crowdfundingContract.withdraw_funds(withdrawCall.calldata)
    await provider.waitForTransaction(tx.transaction_hash)
    console.log('Withdrew funds from campaign_no ', campaign_no);
}

//getLatestCampaignNo();
//createCampaign('StarkTest', accountAddress, ETHAddress, 0.001);
//contribute(2, 0.001);
//getFunderContribution(2, accountAddress);
//withdrawContribution(2);
//withdrawFunds(2)
