# actual-importer

This importer allows you to import your Envelope Zero budgets to [Actual Budget](https://actualbudget.org/).

* Works only with an Actual Server. If that does not work for you, please open an issue and I'll see if we can help you out. For now, I decided against implementing functionality that might not even be needed.
* Tested against Actual Server version `26.9.0`.

## Differences

### Not imported

Some data is not imported because it was never fully implemented in Envelope Zero, or Actual Budget does not support it.

This concerns:

* Goals were implemented in the Envelope Zero backend, but never had any logic behind them. Therefore, the importer ignores them.
* Budget Files don't have notes in Actual, so notes for Budgets are not imported
* Reconciliation Data from EZ is ignored, since reconciliation was never implemented in the frontend
* Archival status of Categories and Envelopes is not imported, since this can't be set via the Actual API. You will need to hide them manually in Actual
* The "available from" setting for income works different than holding funds for next month in Actual. This **will lead to differents between Envelope Zero and Actual for the amounts shown in "Unallocated Funds"/"To Budget"** for previous months, which can be corrected manually.

## Design decisions

* All transactions for which it is possible are marked as cleared when being imported, so that you can simply reconcile all accounts, since there should not be any differences.

## How To

Update your budget in Envelope Zero so that all numbers match the actual accounts.

You need [npm](https://www.npmjs.com/) installed, see [their docs](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm) for how to achieve this.

Export your Envelope Zero data by navigating to `/api/v4/export` on your EZ instance and saving the response to e.g. your Downloads folder.

Then, in this git repository, run

```shell
npm install
```

This installs all dependencies for the importer.

Afterwards, you need to create a `.env` file. Copy the `.env.example` and replace the placeholders with the data for your Actual Server instance.

Then, run

```shell
npm start
```

This will convert your Envelope Zero budgets to data Actual Budget can understand and import them to the Actual Server instance.

Now, you need to perform some steps to prepare the second part of the import.

1. Check the accounts in Actual and close the ones you don't use anymore. Accounts that were archived in EZ with a balance of 0 are imported as such. For accounts with a non-zero balance, Actual only allows them to be closed when the funds are transferred to another account, so these are not imported as closed any you will have to close them manually.
2. Clear all transactions. In Actual, go to "All accounts", then filter by "Cleared: Is false", then select all transactions and mark them as cleared with the dropdown next to the search box. Repeat until no new uncleared transactions show up
3. Categorize all uncategorized transactions. There are two types of transactions that need to be categorized:
  1. Second side of income transfers: If you transferred money from off-budget to on-budget accounts, you will have to categorize these transactions, since Actual uses double-entry bookkeeping, which EZ does not.
  2. Transactions where you forgot to set an Envelope. Since EZ does not enforce an envelope for every transaction, there might be transactions where you forgot to set an Envelope in EZ. These need to be categorized in Actual.
4. Reconcile all accounts
5. Hide all Category groups and Categories that you had archived in Envelope Zero.

Your budget in Actual should now look correct and exactly like in Envelope Zero before, except for the "To Budget" amounts. To balance these, you can manually go through the budget and use the "Hold for next month"/"Release hold for next month" buttons.

The "To Budget" amount for the current month however should now be the same as "Unallocated Funds" was in Envelope Zero.

Congratulations, you're done!
