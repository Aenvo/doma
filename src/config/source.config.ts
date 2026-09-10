import fs from 'fs';
import { resolve } from 'path';

interface InputSource{
    input: string;
    output: {
        inlineDynamicImports: boolean;
    }
}

/**
 *
 * @param {String} path  source 的path；如："./src/Resources/chrome", "./src/Resources/"
 * @param {String} dir   source及下面的文件或文件夹; 如："source"
 * @param {String} type  类型，source或lib；默认source, source为source目录下的文件或文件夹会构建输出，lib为lib目录下的文件或文件夹只是拷贝输出
 * @returns
 */
function addSourceEntry(path:string, dir:string, sourceConfigMap:Record<string, string>, type:string = "source") {
    if(!path){
        return sourceConfigMap;
    }
    if(!fs.existsSync(`${path}/${dir}`)){
        return sourceConfigMap;
    }
    
    let fileOrDir = fs.readdirSync(`${path}/${dir}`);
    fileOrDir.forEach(function(file) {
        if(file === 'search' || file === 'service-worker.ts'){
            return;
        }
        let entryName = `${dir}/${file}`;
        let newDir = `${path}/${dir}/${file}`;
        if (fs.statSync(newDir).isDirectory()) {
            addSourceEntry(path, `${dir}/${file}`, sourceConfigMap, type);
        }else{
          let sourceKey = entryName;
          if(type === "source"){
            sourceKey = entryName.replace(/\.[^/.]+$/, "");
          }
          if (sourceConfigMap[sourceKey] && type === "source") {
                throw new Error("有名字重复的页面:" + dir);
            }else{
                sourceConfigMap[sourceKey] = newDir
            }
        }
    });
}


export const inputSourceConfig = (
  platformName: string,
  browserName: string,
  _buildEdition = 'open',
) => {
  const sourceConfigMap: Record<string, string> = {};
  addSourceEntry(`./src/resources`, 'source', sourceConfigMap, 'source');
  addSourceEntry(
    `./src/resources/platform/${platformName}/${browserName}`,
    'source',
    sourceConfigMap,
    'source',
  );
  return sourceConfigMap;
};

const hasFilesInDirectorySync = (dirPath: string): boolean => {
    try {
        if (fs.existsSync(dirPath)) {
            const files = fs.readdirSync(dirPath);
            return files.length > 0;
        }
        return false;
    } catch (error) {
        console.error('Error checking directory:', error);
        return false;
    }
}

/** Open 仓：固定使用单轨资源路径 */
export const copyFilesConfig = (OUTPUT_DIR:string, platformName:string, browserName:string, _buildEdition = 'open') => {
    const targets = [
        {
            src: resolve(`src/resources/platform/${platformName}/${browserName}/manifest.json`),
            dest: resolve(`${OUTPUT_DIR}/`),
            rename: 'manifest.json',
        },
        {
            src: resolve('src/assets/extension-img'),
            dest: resolve(`${OUTPUT_DIR}/`),
            rename: 'extension-img',
        },
        {
            src: resolve('src/assets/favicon.ico'),
            dest: resolve(`${OUTPUT_DIR}/`),
            rename: 'favicon.ico',
        },
        {
            src: resolve(`src/resources/_locales`),
            dest: resolve(`${OUTPUT_DIR}/`)
        },
        {
            src: resolve(`src/resources/config`),
            dest: resolve(OUTPUT_DIR + '/source/dark')
        }
    ];

    const libConfigMap:Record<string, string> = {};
    addSourceEntry(`src/resources`, 'lib', libConfigMap, "lib");
    addSourceEntry(`src/resources/${platformName}/${browserName}`, 'lib', libConfigMap, "lib");
    
    Object.keys(libConfigMap).forEach((key) => {
      const pathRegex = /^(.*\/)/;
      const pathMatch = key.match(pathRegex) || '';
      const path = pathMatch ? pathMatch[1] : '';
      targets.push({
        src: libConfigMap[key],
        dest: resolve(OUTPUT_DIR + '/source/'+ path)
      });
    });
    
    return targets;
};
