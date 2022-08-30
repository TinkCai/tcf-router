const program = require('commander');
const exec = require('child_process').exec;
const fs = require('fs');
const path = require('path');
const pkg = require('../package.json');
const dir = __dirname;
const defaultConfig = require('./template/tcf.config.json');
const CWD = process.cwd();

const getConfigFile = (filePath = '') => {
  if (filePath) {
    const stat = fs.lstatSync(filePath);
    if (stat.isDirectory()) {
      const files = fs.readdirSync(filePath);
      for (const file of files) {
        const fileAbsolutePath = path.join(filePath, file);
        if (
          fs.lstatSync(file).isFile() &&
          (file.endsWith('tcf.config.json') || file.endsWith('tcf.config.js'))
        ) {
          return require(fileAbsolutePath);
        }
      }
      throw new Error('no config file found');
    } else {
      return require(filePath);
    }
  } else {
    return defaultConfig;
  }
};

const installInquirer = [
  {
    type: 'list',
    message: 'Do you want to install all dependencies?',
    name: 'installNow',
    default: 'yes',
    choices: ['yes', 'no']
  }
];

const layerInquiry = [
  {
    type: 'input',
    message: 'Please input the layer name',
    name: 'layerName',
    default: () => {
      return 'module-2';
    }
  }
];

const functionInquiry = [
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
    filter: function(val) {
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
  if (configPath && !path.isAbsolute(configPath)) {
    configPath = path.join(CWD, configPath);
  }
  const nodeFiles = [
    path.join(dir, '../node_modules/ts-node/dist/bin.js'),
    path.join(dir, '../../ts-node/dist/bin.js')
  ];
  let nodeFilePath = '';
  for (const file of nodeFiles) {
    if (fs.existsSync(file)) {
      nodeFilePath = file;
      break;
    }
  }
  const subProcess = exec(
    `node "${nodeFilePath}" "${execFilePath}" "${CWD}" "${configPath || CWD}"`,
    {
      maxBuffer: 1024 * 2000
    },
    function(err, stdout, stderr) {
      console.log(err, stdout, stderr);
    }
  );
  subProcess.stdout.on('data', (data) => {
    console.log(data);
  });
};

const createLayerProcess = (result)=> {
  const config = getConfigFile(result.configFile);
  const layerRootDir = path.join(result.cwd || CWD, config.layerPath || '');
  if (!fs.existsSync(layerRootDir)) {
    fs.mkdirSync(layerRootDir);
  }
  const layerDir = path.join(result.cwd || CWD, config.layerPath || '', result.layerName);
  if (fs.existsSync(layerDir)) {
    throw new Error('Layer exists, please check again.');
  } else {
    fs.mkdirSync(layerDir);
  }
};

const createFunctionProcess = (result) => {
  const config = getConfigFile(result.configFile);
  const functionDir = path.join(result.cwd || CWD, config.appPath || '', result.functionName);
  if (fs.existsSync(functionDir)) {
    throw new Error('Function exists, please check again.');
  } else {
    fs.mkdirSync(functionDir);
  }
  const packageName =
    result.language === 'typescript' ? 'package-ts.json' : 'package-js.json';
  const packageFilePath = path.join(dir, `template/${packageName}`);
  const tsConfigFilePath = path.join(dir, 'template/tsconfig.json');
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
  fs.copyFileSync(
    tsConfigFilePath,
    path.join(
      functionDir,
      'tsconfig.json'
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

const actionCreate = async (component, cmd) => {
  if (component === 'function') {
    const { default: inquirer } = await import('inquirer');
    const result = await inquirer.prompt(functionInquiry);
    createFunctionProcess(result);
    console.log(`function ${result.functionName} has been created`);
  } else if (component === 'layer') {
    const { default: inquirer } = await import('inquirer');
    const result = await inquirer.prompt(layerInquiry);
    createLayerProcess(result);
    console.log(`layer ${result.layerName} has been created`);
  } else {
    console.log('not a valid component name');
  }
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
  fs.copyFileSync(
    path.join(dir, 'template/tcf.ci.js'),
    path.join(projectPath, 'tcf.ci.js')
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
      function(err, stdout, stderr) {
        console.log(err, stdout, stderr);
      }
    );
    subProcess.stdout.on('data', (data) => {
      console.log(data);
    });
  }
};

const actionDeploy = async (configPath, cmd) => {
  const execFilePath = path.join(dir, `deploy.js`);
  if (configPath && !path.isAbsolute(configPath)) {
    configPath = path.join(CWD, configPath);
  }
  const nodeFiles = [
    path.join(dir, '../node_modules/ts-node/dist/bin.js'),
    path.join(dir, '../../ts-node/dist/bin.js')
  ];
  let nodeFilePath = '';
  for (const file of nodeFiles) {
    if (fs.existsSync(file)) {
      nodeFilePath = file;
      break;
    }
  }

  const subProcess2 = exec(
    `node "${execFilePath}" "${CWD}" "${configPath || CWD}"`,
    {
      maxBuffer: 1024 * 2000
    },
    function(err, stdout, stderr) {
      if (err || stderr) {
        console.error(err, stderr);
      } else {
        // console.log(stdout);
      }
    }
  );
  subProcess2.stdout.on('data', (data) => {
    console.log(data);
  });
};

program
  .version(pkg.version)
  .command('create <component> [configFile]')
  .description('create a component, valid component values are [function, layer]')
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

program
  .command('deploy [configPath]')
  .description('deploy your cloudbase functions')
  .action(actionDeploy);

program.parse(process.argv);
