const program = require('commander');
const exec = require('child_process').exec;
const fs = require('fs');
const path = require('path');
const pkg = require('../package.json');
const dir = __dirname;

const CWD = process.cwd();

const installInquirer = [
  {
    type: 'list',
    message: 'Do you want to install all dependencies?',
    name: 'installNow',
    default: 'yes',
    choices: ['yes', 'no']
  }
];

const languages = [
  {
    type: 'input',
    message: 'Please input the function name',
    name: 'functionName',
    default: (val) => {
      return 'my-app';
    }
  },
  {
    type: 'list',
    message: 'Please select the programming language',
    name: 'language',
    default: 'typescript',
    choices: ['typescript', 'javascript'],
    filter: function (val) {
      return val.toLowerCase();
    }
  },
  {
    type: 'list',
    message: 'Does this cloud function need a public webservice path?',
    name: 'isWebservice',
    default: 'yes',
    choices: ['yes', 'no']
  },
  {
    type: 'input',
    when: (val) => {
      return val.isWebservice === 'yes';
    },
    message: 'Please input the path, please starts with /',
    name: 'urlPath',
    default: (val) => {
      return '/' + val.functionName;
    },
    validate: (val) => {
      if (val && val.startsWith('/')) {
        return !val.includes(' ') || 'ERR: Please remove the space';
      } else {
        return 'not a valid path';
      }
    }
  }
];

const actionInit = () => {
  const configFilePath = path.join(dir, 'template/tcf.config.json');
  fs.copyFileSync(configFilePath, path.join(CWD, 'tcf.config.json'));
  fs.mkdirSync(path.join(CWD, 'functions'));
};

const actionDev = (configPath, cmd) => {
  const execFilePath = path.join(dir, `server.ts`);
  const subProcess = exec(
    `node "${path.join(
      dir,
      '../node_modules/ts-node/dist/bin.js'
    )}" "${execFilePath}" "${CWD}" "${configPath || CWD}"`,
    {
      maxBuffer: 1024 * 2000
    },
    function (err, stdout, stderr) {
      console.log(err, stdout, stderr);
    }
  );
  subProcess.stdout.on('data', (data) => {
    console.log(data);
  });
};

const createFunctionProcess = (result) => {
  const functionDir = path.join(result.cwd || CWD, result.functionName);
  if (fs.existsSync(functionDir)) {
    throw new Error('Function exists, please check again.');
  } else {
    fs.mkdirSync(functionDir);
  }
  const packageName =
    result.language === 'typescript' ? 'package-ts.json' : 'package-js.json';
  const packageFilePath = path.join(dir, `template/${packageName}`);
  const indexFilePath = path.join(
    dir,
    `template/index.${result.language === 'typescript' ? 'ts' : 'js'}`
  );
  const routerFilePath = path.join(
    dir,
    `template/routers/demo.router.${
      result.language === 'typescript' ? 'ts' : 'js'
    }`
  );
  const packageContent = require(packageFilePath);
  packageContent.name = result.functionName;
  if (result.isWebservice) {
    packageContent.webservice.path = result.urlPath;
  } else {
    delete packageContent.webservice;
  }
  fs.writeFileSync(
    path.join(functionDir, 'package.json'),
    JSON.stringify(packageContent, '  ', 2)
  );
  fs.copyFileSync(
    indexFilePath,
    path.join(
      functionDir,
      `index.${result.language === 'typescript' ? 'ts' : 'js'}`
    )
  );
  fs.mkdirSync(functionDir + '/routers');
  fs.copyFileSync(
    routerFilePath,
    path.join(
      functionDir,
      `/routers/demo.router.${result.language === 'typescript' ? 'ts' : 'js'}`
    )
  );
};

const actionCreate = async (cmd) => {
  const { default: inquirer } = await import('inquirer');
  const result = await inquirer.prompt(languages);
  createFunctionProcess(result);
  console.log(`function ${result.functionName} has been created`);
};

const actionNew = async (projectName, cmd) => {
  const projectPath = path.join(CWD, projectName);
  if (fs.existsSync(projectPath)) {
    throw new Error('Project exists, please check again.');
  } else {
    fs.mkdirSync(projectPath);
  }
  fs.mkdirSync(projectPath + '/functions');
  const packageFilePath = path.join(dir, `template/package.json`);
  const versionPath = path.join(dir, '../package.json');
  const version = require(versionPath).version;
  const packageContent = require(packageFilePath);
  packageContent.name = projectName;
  packageContent.dependencies['tcf-router'] = version;
  fs.writeFileSync(
    path.join(projectPath, 'package.json'),
    JSON.stringify(packageContent, '  ', 2)
  );
  fs.copyFileSync(
    path.join(dir, 'template/tcf.config.json'),
    path.join(projectPath, 'tcf.config.json')
  );
  createFunctionProcess({
    functionName: 'tcf-demo-function',
    language: 'typescript',
    isWebservice: 'yes',
    urlPath: '/',
    cwd: projectPath + '/functions'
  });
  console.log(`project ${projectName} has been created!`);
  const { default: inquirer } = await import('inquirer');
  const result = await inquirer.prompt(installInquirer);
  if (result.installNow === 'yes') {
    const subProcess = exec(
      `cd ${projectName} && npm install`,
      {
        maxBuffer: 1024 * 2000
      },
      function (err, stdout, stderr) {
        console.log(err, stdout, stderr);
      }
    );
    subProcess.stdout.on('data', (data) => {
      console.log(data);
    });
  }
};

program
  .version(pkg.version)
  .command('create')
  .description('create a cloud function with template')
  .action(actionCreate);

program
  .command('dev [configPath]')
  .description('run local service')
  .action(actionDev);

program
  .command('init')
  .description('initialize your cloudbase project')
  .action(actionInit);

program
  .command('new <projectName>')
  .description('new a tcf project')
  .action(actionNew);

program.parse(process.argv);
