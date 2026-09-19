# actual-importer

This importer allows you to import your Envelope Zero budgets to [Actual Budget](https://actualbudget.org/).

:warning: This only works with an Actual Server. If that does not work for you, please open an issue and I'll see if we can help you out. For now, I decided against implementing functionality that might not even be needed.

## How To

You need [npm](https://www.npmjs.com/) installed, see [their docs](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm) for how to achieve this.

Export your Envelope Zero data from the budgets overview and save it in e.g. your Downloads directory.

Then, in this git repository, run

```
npm install
```

This installs all dependencies for the importer.

Afterwards, you need to create a `.env` file. Copy the `.env.example` and replace the placeholders with the data for your Actual Server instance.

Then, run

```
npm start
```

This will convert your Envelope Zero budgets to data Actual Budget can understand and import them to the Actual Server instance.
