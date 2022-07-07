# TCB Express-Like Router

利用腾讯云开发的云函数功能，部署自己的公网云服务。像用Express开发Web服务一样简单，并且提供了本地debug工具，该工具同样可以用于部署在服务器上。

## How to create & build
Install
```
npm install tcf-router -g
// or
yarn global add tcf-router
```

Create Project
```
tcf new my-tcf-project
```

(optional)Create another cloud function
```
tcf create
```

Run
```
tcf dev
```

Now you can see what happened in your browser

## Config your local service
```json
{
  "appPath": "./functions", // the functions' dir path
  "functionEnvVariables": {
    "STAGE": "LOCAL"  // these info will be saved in the environment, you can use process.env.XXX to get
  },
  "context": {  // mock the data of context
    "appId": "wx7ce310ee1e4efd39",
    "uin": "mockuintinkcai831",
    "envId": "local"
  },
  "devServer": {
    "port": 8081,
    "https": false  // https could be {cert: '', key, ''} if you want https
  }
}

```
