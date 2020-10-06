#!/usr/bin/env node

var fs = require('fs');
const del = require('del');
var fetch = require('node-fetch');
const makeDir = require('make-dir');
var readDir = require('readdir');
const ora = require('ora');
const spinner = ora('开始打包编辑').start();
const project = process.cwd();

const startTime = new Date().getTime();
let num = 1;
function delDist () {
  spinner.warn('开始删除dist');//开始
  // console.log('开始删除dist')
  return new Promise(resolve => {
    del(`${project}/dist/`);
    resolve();
  });
}
// 检查版本
function verVersion () {
spinner.warn('开始验证版本号');//开始
// spinner.start('开始验证版本号');//开始
  return new Promise(resolve => {
    function fn () {
      const package = require(`${project}/package.json`);
      const { version, onlineStaticConfig } = package || {};
      const {
        url: onlineURL,
        jsPath: onlineJsPath,
        versionPath: onlineVersionPath
      } = onlineStaticConfig || {};

      const checkUrl = `${onlineURL}${onlineVersionPath}/${version}/config.js`;

      fetch(checkUrl).then(response => {
        const { status } = response;
        if (Number(status) === 200) {
          /** 当前版本已上线 */
          // 版本号最后一位加 1
          const arr = version.split('.');
          arr[arr.length - 1] = Number(arr[arr.length - 1]) + 1;

          // 新的版本号赋值
          package.version = arr.join('.');
          spinner.info(`版本号已更新，当前版本为:${package.version}`);
          
          fs.writeFileSync(
            `${project}/package.json`,
            JSON.stringify(package, null, 2)
          );
          setTimeout(() => {
            fn();
          }, 100);
        } else {
          // console.log('版本号没有变化');
          resolve();
        }
      });
    }
    fn();
  });
}

// 运行打包命令
function build () {
  return new Promise(resolve => {
    const { exec } = require('child_process');
    spinner.warn('注意开始打包了')
    spinner.start('打包中');
    spinner.color = 'yellow';
    exec(
      'npm run build',
      {
        maxBuffer: 5000 * 1024 // 默认 200 * 1024
      },
      error => {
        if (error) {
          spinner.fail(`执行出错: ${error}`)
          console.error(`执行出错: ${error}`);
          return;
        }
        // console.log(`webpack编译成功 666`);
        spinner.succeed(`webpack编译成功 666`)
        // spinner.stop();//开始
        resolve();
      }
    );
  });
}

// 生成config
function createConfig () {
  const package = require(`${project}/package.json`);
  const { onlineStaticConfig, localStaticConfig } = package;

  const { url: onlineURL, jsPath: onlineJsPath } = onlineStaticConfig || {};

  const { jsPath: localJsPath, versionPath: localVersionPath } =
    localStaticConfig || {};

  return new Promise(resolve => {
    spinner.info(`开始生成config`)
    if (!onlineStaticConfig) {
      console.log(
        '请在项目的package.json里定义线上url地址：onlineStaticConfig'
      );
      return null;
    }
    const obj = {};
    // 读取webpack 打包后的静态 文件
    fs.readdir(`${project}${localJsPath}`, function (err, files) {
      if (err) {
        console.log('err', err);
      }
      // 循环文件，找出main vendor 两个js
      files.forEach(ele => {
        const bol = /^(chunk-vendors|main)\.\S*.js/.test(ele);
        if (bol) {
          const url = `${onlineURL}${onlineJsPath}/${ele}`;
          if (/^main\.(.?)+(.js)$/.test(ele)) {
            obj.main = url;
          }
          if (/^chunk-vendors\.(.?)+(.js)$/.test(ele)) {
            obj.vendor = url;
          }
        }
      });

      const config_content = `(
        function(){
          var mainConfig = ${JSON.stringify(obj, null, 2)};
          loadScript(mainConfig.vendor, function() {
            loadScript(mainConfig.main);
          })
        }
      )();`

      const distPath = `${project}${localVersionPath}`;
      // 不带版本号，写入dist 为了预发布环境不用更改版本号
      makeDir(distPath).then(path => {
        fs.writeFileSync(
          `${distPath}/config.js`,
          config_content
        );
      });
      // 文件写入
      const versionPath = `${project}${localVersionPath}/${package.version}`;
      makeDir(versionPath).then(path => {
        fs.writeFileSync(
          `${versionPath}/config.js`,
          config_content
        );
        const endTime = new Date().getTime();
        const tim = parseFloat((endTime - startTime) / 1000);
        // console.log('config生成成功');
        spinner.succeed(`config生成成功`)
        //console.log(`编译完成，时间共消耗了${tim}秒`);
        spinner.info(`编译完成，时间共消耗了${tim}秒`)
        resolve();
      });
    });
  });
}

// 删除线上已有文件
function delOnlineJS () {
  const package = require(`${project}/package.json`);
  const { onlineStaticConfig, localStaticConfig } = package || {};

  const { url: onlineURL, jsPath: onlineJsPath } = onlineStaticConfig || {};

  const { jsPath: localJsPath } = localStaticConfig || {};

  console.log('开始删除线上已有文件');
  return new Promise(resolve => {
    readDir.read(`.${localJsPath}`, ['**'], function (err, files) {
      const len = files.length;
      let num = 0;
      // console.log('files', files);
      files.forEach(fil => {
        const _url = `${onlineURL}${onlineJsPath}/${fil}`;
        // console.log('_url', _url);
        fetch(_url).then(response => {
          num += 1;
          const { status } = response;
          if (Number(status) === 200) {
            /** 当前版本已上线 */
            console.log(`删除文件：${_url}`);
            del(`${project}${localJsPath}/${fil}`);
          }
          if (num === len) {
            resolve();
          }
        });
      });
    });
  });
}
if (process.argv[2] === '--del') {
  delOnlineJS();
} else {
  delDist()
    .then(verVersion)
    .then(build)
    .then(createConfig);
}
