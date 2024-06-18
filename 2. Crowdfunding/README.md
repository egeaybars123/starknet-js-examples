# Crowdfunding (Starknet-js + Cairo)

In this tutorial, you will deploy a Crowdfunding contract in Cairo on Starknet Sepolia Testnet. Then, using Starknet-js, you will learn how to interact with the Crowdfunding contract.

Before getting started, here are the prerequisites for the tutorial content: 
- Basic knowledge of Cairo: you can get familiar with the Cairo language, and learn how to build a simple smart contract with Cairo [here](https://book.cairo-lang.org/).

- Scarb for compiling Cairo code and packaging support: follow [here](https://docs.swmansion.com/scarb/download.html).

- Starkli for the declaration and deployment of Cairo contracts: follow [here](https://book.starkli.rs/installation).

## Writing Crowdfunding contract in Cairo:

In order to start writing our Cairo code, the functionalities of our code should be determined. Here is what our contract should be able to do: 
- **Create Campaign**: Users should be able to create a new campaign by providing necessary information. The campaign could include the information: **beneficiary address** (who will receive the funds), **token address** (in which token funds should be provided), **goal** (the target of the campaign), **amount** (current amount of funds for campaign), **number of funders** (we can check how many people contributed to the campaign), **end time** (when the campaign will end).

- **Contribute**: Users will be able to fund the campaign of their choice. They should provide the funds in the token address specified in the campaign info.

- **Withdraw Funds**: If the campaign reaches its goal and its end time, the beneficiary will be able to withdraw the funds from the campaign.

- **Withdraw Contribution**: If the campaign cannot reach its goal, but reaches its end time, the funders will be able to withdraw their funds.

According to the functionalities above, let's start writing our contract in Cairo! You can follow along [this](https://github.com/egeaybars123/crowdfunding-cairo) repository.

Firstly, create a Scarb package, and create `crowdfunding.cairo` file in your source directory. Do not forget to delete the contents of `lib.cairo`, and add your crowdfunding contract as a module: 
```rs
// Directory: src/lib.cairo 
mod crowdfunding;
```
Do not forget to add the dependencies to the `Scarb.toml`:

```toml
[dependencies]
starknet=">=2.4.1"

[[target.starknet-contract]]
```

Let's define the structs we need! One of the structs we need is Campaign, and define it according to what we described above. Also use the ContractAddress from starknet from the start of the file. The structs are defined outside the implementation block because we will use the Campaign struct in the trait: 
```rs
use starknet::ContractAddress;

#[derive(Copy, Drop, Serde, starknet::Store)]
struct Campaign {
    name: felt252,
    beneficiary: ContractAddress,
    token_addr: ContractAddress,
    goal: u256,
    amount: u256,
    numFunders: u64,
    end_time: u64,
}
```

Another struct we need is the Funder struct. If we would like to track how much contribution which address made, we will need this struct (it will make more sense once we define Legacy Maps in the Storage section):
```rs
#[derive(Copy, Drop, Serde, starknet::Store)]
struct Funder {
    funder_addr: ContractAddress,
    amount_funded: u256
}
```
Next, we need to define our interface. Below, you can see all the external functions of our contract. All of the functions will be explained thorougly, but you can copy & paste them for now if you wish. We need this trait for external Starknet functions, and need to make the function definitions for all of them: 
```rs
#[starknet::interface]
trait ICrowdfunding<TContractState> {
    fn create_campaign(
        ref self: TContractState,
        _name: felt252,
        _beneficiary: ContractAddress,
        _token_addr: ContractAddress,
        _goal: u256
    );
    fn contribute(ref self: TContractState, campaign_no: u64, amount: u256);
    fn withdraw_funds(ref self: TContractState, campaign_no: u64);
    fn withdraw_contribution(ref self: TContractState, campaign_no: u64);
    fn get_funder_identifier(
        self: @TContractState, campaign_no: u64, funder_addr: ContractAddress
    ) -> felt252;
    fn get_funder_contribution(self: @TContractState, identifier_hash: felt252) -> u256;
    fn get_latest_campaign_no(self: @TContractState) -> u64;
}
```
Let's define our contract, and start writing it. Our structs are imported along with StarknetOS and Poseidon hash functions. We will learn how & why we use them:
```rs
#[starknet::contract]
mod Crowdfunding {
    use super::{Campaign, Funder};
    use starknet::{ContractAddress, get_caller_address, get_contract_address, get_block_timestamp};
    use core::poseidon::{PoseidonTrait, poseidon_hash_span};
    use core::hash::{HashStateTrait, HashStateExTrait};
    use core::traits::{Into};

    #[storage]
    struct Storage {
        campaign_no: u64,
        campaign_duration: u64,
        campaigns: LegacyMap<u64, Campaign>,
        funder_no: LegacyMap<felt252, Funder>,
    }

    #[constructor]
    fn constructor(ref self: ContractState, _duration: u64) {
        self.campaign_duration.write(_duration);
    }

    //write functions here
}
```
Also, the storage component of the Cairo contract is defined which contains the current campaign number, campaign duration and two legacy maps. This part is really important because this is where we manage the state of our contract.
- Campaign_no: We need campaign_no because we want to store the Campaign info for each campaign to see when the campaign ends, and whether or not the campaign reached its goal.
- Campaign_duration: It is the same for each campaign and is set by the contract deployer in the constructor function. This part is customizable: you can set it to 1 year or 2 weeks, up to you! 
- Campaigns: This legacy maps stores Campaign struct as a value corresponding to a campaign_no key.
- Funder_no: This is where we store a funder's address and funded amount to a campaign. It is not possible to store an array of Funder structs in Campaign struct in Cairo to keep the Funder list for each campaign, so we can create an identifier for each Funder for each campaign using the Poseidon hash. How the hash is derived will be explained below in the `get_funder_identifier` function.

Additionally, the constructor function is written. Constructor function is called only when the contract is being deployed. In our constructor function, we set the campaign_duration for each campaign, so we will need to specify the duration (in seconds) while deploying our contract.

Now, let's write `create_campaign` function for our contract. We have to put our public functions inside the impl block where we also add the line `#[abi(embed_v0)]` above the impl block which means that all functions embedded inside it are implementations of the Starknet interface of the contract. It affects the visibility of the functions in the impl block where they become public (accessible by RPC calls & other Cairo contracts):

```rs
//inside CrowdfundingImpl
#[abi(embed_v0)]
    impl CrowdfundingImpl of super::ICrowdfunding<ContractState> {
        fn create_campaign(
            ref self: ContractState,
            _name: felt252,
            _beneficiary: ContractAddress,
            _token_addr: ContractAddress,
            _goal: u256
        ) {
            let new_campaign_no: u64 = self.campaign_no.read() + 1;
            self.campaign_no.write(new_campaign_no); //update current campaign_no

            let new_campaign: Campaign = Campaign {
                name: _name,
                beneficiary: _beneficiary,
                token_addr: _token_addr,
                goal: _goal,
                amount: 0,
                numFunders: 0,
                end_time: get_block_timestamp() + self.campaign_duration.read()
            };

            self.campaigns.write(new_campaign_no, new_campaign);
        }
        //add other external functions
    }
```

When a campaign is created, it is assigned a new campaign number. Then, a Campaign struct variable is created with struct variables, and end_time is also set. In order to set the end_time timestamp, we call `get_block_timestamp()` function to get the current timestamp and add it to the campaign_duration variable. Afterwards, the new campaign is written to the new campaign_no key in a mapping.

In order to proceed with other functions, we need to write our functions: `get_funder_identifier` and `get_funder_contribution`. We want to obtain how much fund each address contributed for a campaign, and it is not possible to store a list of Funder struct in Campaign struct in Cairo, so we can make use of the Poseidon hash function! If we have campaign_no and the address of the funder as an input to the Poseidon hash function, we will get a unique identifier_hash for each funder address for each campaign, so we will be able to keep a record of how much contribution each address made for each campaign. In `get_funder_contribution`, the identifier_hash is provided, and the amount of funds the address contributed (which the identifier_hash corresponds to) is returned.

```rs
//inside CrowdfundingImpl
    fn get_funder_identifier(
            self: @ContractState, campaign_no: u64, funder_addr: ContractAddress
        ) -> felt252 {
            let identifier_hash = PoseidonTrait::new()
                .update(campaign_no.into())
                .update(funder_addr.into())
                .finalize();

            identifier_hash
        }
    fn get_funder_contribution(self: @ContractState, identifier_hash: felt252) -> u256 {
            let funder = self.funder_no.read(identifier_hash);

            funder.amount_funded
        }
```


Next function we need is the `contribute`. In this function, we will transfer the contributors' tokens into our contract. Firstly, we need our users to approve the function (will be done in Starknet-js), and then execute the `transfer_from` function in our contract with an amount they provide in the function parameter. 

```rs
//inside CrowdfundingImpl
    fn contribute(ref self: ContractState, campaign_no: u64, amount: u256) {
            let mut campaign = self.campaigns.read(campaign_no);
            assert(get_block_timestamp() < campaign.end_time, 'Campaign ended');

            campaign.amount += amount; //update the campaign's total fund amount
            campaign.numFunders += 1; //increment the number of funders

            //obtain the address which called the function a.k.a the funder
            let funder_addr = get_caller_address(); 
            //call the funder identifier function
            let funder_identifier: felt252 = self.get_funder_identifier(campaign_no, funder_addr);
            //using the identifier_hash, get the current funder amount, and add the new amount to it.
            let new_funder_amount = amount + self.get_funder_contribution(funder_identifier);
            //create a Funder variable with the updated amount
            let funder = Funder { funder_addr: funder_addr, amount_funded: new_funder_amount };

            //write the new Funder variable to the mapping storage
            self.funder_no.write(funder_identifier, funder);
            //update the campaign info with the updated amount + numFunders.
            self.campaigns.write(campaign_no, campaign);

            //call the transfer_from function in the token contract.
            IERC20Dispatcher { contract_address: campaign.token_addr }
                .transfer_from(funder_addr, get_contract_address(), amount);
        }
```

Firstly, using the campaign_no, the campaign info is retrieved to check if the campaign the user wants to contribute to has ended in the next line. If the campaign has ended, and the condition in the assert function is false, the transaction reverts. 

Note that IERC20Dispatcher is used which we have not covered yet. Let's dive into what dispatchers are (for more info: see [here](https://book.cairo-lang.org/ch15-02-contract-dispatchers-library-dispatchers-and-system-calls.html)). We need Dispatchers for cross-contract interactions. In our case, we need to transfer the token from the funder's address to our contract, so we call the `transfer_from` function from the token contract in our own contract. In order to implement Dispatchers, we need to write the trait for it first by including the function definitions of all the functions we will call from other contracts:

```rs
//outside the mod Crowdfunding{}
trait IERC20DispatcherTrait<T> {
    fn transfer_from(self: T, sender: ContractAddress, recipient: ContractAddress, amount: u256);
    fn transfer(self: T, recipient: ContractAddress, amount: u256);
}
```

Then, let's implement the functions in the trait. However, in this case, we do not need to write any code inside the functions; `starknet::call_contract_syscall` is called instead which triggers the function from the contract. Additionally, the struct `IERC20Dispatcher` is defined which only takes in a contract address (the contract we want to call a function from):
```rs
//outside the mod Crowdfunding{}
#[derive(Copy, Drop, Serde, starknet::Store)]
struct IERC20Dispatcher {
    contract_address: ContractAddress,
}

impl IERC20DispatcherImpl of IERC20DispatcherTrait<IERC20Dispatcher> {
    fn transfer_from(
        self: IERC20Dispatcher, sender: ContractAddress, recipient: ContractAddress, amount: u256
    ) { // starknet::call_contract_syscall is called in here 
    }
    fn transfer(
        self: IERC20Dispatcher, recipient: ContractAddress, amount: u256
    ) { // starknet::call_contract_syscall is called in here 
    }
}
```

Now, we are good to go! Let's write the `withdraw_funds` function which is meant to be triggered by the beneficiary of the campaign if the campaign reaches its goal and end time:
```rs
//inside CrowdfundingImpl
fn withdraw_funds(ref self: ContractState, campaign_no: u64) {
    let mut campaign = self.campaigns.read(campaign_no);
    let campaign_amount = campaign.amount; //Store the campaign amount in a variable to be used later.
    let caller = get_caller_address(); //Get the address which calls the functions

    //Check if the caller is the beneficiary
    assert(caller == campaign.beneficiary, 'Not the beneficiary'); 
    //Check if the campaign reached its goal.
    assert(campaign.amount >= campaign.goal, 'Goal not reached');
    //Check if the campaign reached its end time
    assert(get_block_timestamp() > campaign.end_time, 'Campaign ended');

    //Set the campaign amount to 0 because the beneficiary is withdrawing
    //It's important to update! Otherwise the beneficiary can withdraw more than the campaign amount
    campaign.amount = 0;
    //Update the campaign info with the updated amount.
    self.campaigns.write(campaign_no, campaign);

    //Transfer the funds (of the amount campaign_amount) from the contract to the beneficiary
    IERC20Dispatcher { contract_address: campaign.token_addr }
        .transfer(campaign.beneficiary, campaign_amount);
}

```

Next, let's write the `withdraw_contribution` function which can only be called by the users if the campaign did not reach its goal when the end time is reached:
```rs
//inside CrowdfundingImpl
fn withdraw_contribution(ref self: ContractState, campaign_no: u64) {
    //Get the campaign info
    let campaign = self.campaigns.read(campaign_no);
    //Obtain the identifier hash of the funder
    let funder_identifier = self.get_funder_identifier(campaign_no, get_caller_address());
    //Get how much the funder address contributed for the given campaign_no
    let contribution_amount = self.get_funder_contribution(funder_identifier);

    //Get the funder info, given the identifier hash of the funder.
    let mut funder = self.funder_no.read(funder_identifier);
    //Assign the total amount funded to a variable to be used later.
    let amount_funded = funder.amount_funded;

    //Check if the campaign has ended. If it did not end yet, revert the transaction.
    assert(get_block_timestamp() > campaign.end_time, 'Campaign not ended');

    //Check if the campaign did not meet its goal. If it did, do not allow the funders to withdraw.
    assert(campaign.amount < campaign.goal, 'Campaign reached goal');

    //Check if the address is a funder.
    //This part protects the users from sending an unnecessary transaction
    //where they could withdraw zero amount of token for a campaign.
    assert(contribution_amount > 0, 'Not a funder');

    //Update the funder's amount_funded to 0
    //It's important to update. Otherwise, the funder could withdraw more than their funded amount.
    funder.amount_funded = 0;
    //Update the Funder struct corresponding to the identifier hash for the funder's address.
    self.funder_no.write(funder_identifier, funder);

    //Transfer the amount of token the funder gave back to the funder's address from the contract.
    IERC20Dispatcher { contract_address: campaign.token_addr }
        .transfer(funder.funder_addr, amount_funded);
    }
```

After that, let's write the remaining view functions that will allow us to get the data in storage variables like the Funder info or the current campaign_no etc.:

```rs
//inside CrowdfundingImpl
    //Get the current campaign number
    fn get_latest_campaign_no(self: @ContractState) -> u64 {
            self.campaign_no.read()
    }
```

## Declaring and Deploying the Crowdfunding contract
