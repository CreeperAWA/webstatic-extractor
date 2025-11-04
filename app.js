const LimitPromise = function (max) {
    this._max = max;
    this._count = 0;
    this._taskQueue = [];
};
LimitPromise.prototype.call = function (caller, ...args) {
    return new Promise((resolve, reject) => {
        const task = this._createTask(caller, args, resolve, reject);
        if (this._count >= this._max) {
            this._taskQueue.push(task);
        } else {
            task();
        }
    });
};

LimitPromise.prototype._createTask = function (caller, args, resolve, reject) {
    return () => {
        caller(...args)
            .then(resolve)
            .catch(reject)
            .finally(() => {
                this._count--;
                if (this._taskQueue.length) {
                    // console.log('a task run over, pop a task to run')
                    let task = this._taskQueue.shift();
                    task();
                } else {
                    // console.log('task count = ', count)
                }
            });
        this._count++;
        // console.log('task run , task count = ', count)
    };
};
const limitP = new LimitPromise(128);
function extname(url) {
    if (url.indexOf('data:') === 0) {
        const mime = url.match(/data:([^;]+)/)[1];
        return mime.split('/')[1];
    }
    return url.split('.').pop();
}
function basename(url) {
    if (url.indexOf('data:') === 0) {
        return '';
    }
    return url.split('/').pop();
}
function createWebpackRequire(modules, base = '') {
    const installedModules = {};
    function __webpack_require__(moduleId) {
        if (installedModules[moduleId]) return installedModules[moduleId].exports;
        var module = (installedModules[moduleId] = {
            exports: {},
            id: moduleId,
            loaded: false,
        });
        if (!modules[moduleId]) return '';
        modules[moduleId].call(module.exports, module, module.exports, __webpack_require__);
        module.loaded = true;
        return module.exports;
    }
    __webpack_require__.r = function (exports) {
        if (typeof Symbol !== 'undefined' && Symbol.toStringTag) {
            Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
        }
        Object.defineProperty(exports, '__esModule', { value: true });
    };
    __webpack_require__.o = function (object, property) {
        return Object.prototype.hasOwnProperty.call(object, property);
    };
    __webpack_require__.d = function (exports, name, getter) {
        if (!getter) {
            const definition = name;
            for (var key in definition) {
                if (__webpack_require__.o(definition, key) && !__webpack_require__.o(exports, key)) {
                    Object.defineProperty(exports, key, {
                        enumerable: true,
                        get: definition[key],
                    });
                }
            }
            return;
        }
        if (!__webpack_require__.o(exports, name)) {
            Object.defineProperty(exports, name, { enumerable: true, get: getter });
        }
    };

    __webpack_require__.c = installedModules;
    __webpack_require__.p = base;
    return __webpack_require__;
}
function extractSpine(modules, url = '', w = window) {
    const maybeFuncs = [];
    // 新增：识别纯字符串atlas模块
    const atlasModules = [];
    // 新增：识别JSON格式的spine模块
    const jsonModules = [];
    Object.keys(modules).forEach((k) => {
        const e = modules[k];
        const et = e.toString();
        
        // 原有识别逻辑
        if (et.includes('atlas:') && et.includes('json:')) maybeFuncs.push(k);
        
        // 新增：识别导出字符串的模块
        const isStringExport = et.match(/[a-zA-Z0-9]\.exports\s*=\s*"([^"]*)"/);
        if (isStringExport) {
            const content = isStringExport[1];
            // 检测是否为Spine atlas格式 - 改进的检测逻辑
            if (content.includes('size:') && content.includes('filter:') && 
                (content.includes('bounds:') || content.includes('rotate:'))) {
                atlasModules.push({
                    id: k,
                    content: content,
                    // 从内容中提取图集名称
                    atlasName: content.split('\n')[0].trim().replace('.png', '')
                });
            }
        }
        
        // 新增：识别导出JSON的模块
        const isJsonExport = et.match(/[a-zA-Z0-9]\.exports\s*=\s*JSON\.parse\('(.*)'\)/);
        if (isJsonExport) {
            try {
                const content = isJsonExport[1];
                const parsed = JSON.parse(content);
                // 检测是否为Spine JSON 格式
                if (parsed.skeleton && (parsed.bones || parsed.slots)) {
                    jsonModules.push({
                        id: k,
                        content: parsed,
                        // 使用模块ID作为名称，与atlas保持一致
                        jsonName: k
                    });
                }
            } catch (err) {
                console.log(`[extractSpine] Failed to parse JSON module ${k}:`, err);
            }
        }
    });
    
    console.log('[extractSpine] Detected Top-Level Modules:', maybeFuncs);
    console.log('[extractSpine] Detected String Atlas Modules:', atlasModules);
    console.log('[extractSpine] Detected JSON Modules:', jsonModules);
    console.log(modules);
    
    const webpackRequire = createWebpackRequire(modules, url);
    const insideModules = [];
    w.Object._defineProperty = Object.defineProperty;
    w.Object.defineProperty = (module, __esmodule, value) => {
        if (__esmodule === '__esModule') {
            insideModules.push(module);
        }
        return w.Object._defineProperty(module, __esmodule, value);
    };
    const globalThis = window;
    const maybeModules = maybeFuncs.map((e) => webpackRequire(e));
    w.Object.defineProperty = Object._defineProperty;
    const spines = [];
    const mains = [];
    console.log('Detected Sub-Level Modules:', insideModules);
    const checkva = (va, name) => {
        console.log(va, name);
        const vk = Array.isArray(va) ? 0 : Object.keys(va)[0];
        let v = va[vk];
        if (!v) return;
        if (typeof v !== 'object') {
            v = va;
        }
        if (v.atlas && v.json) {
            spines.push(va);
            Object.keys(va).forEach((key) => {
                // 为每个Spine资源设置模块名
                va[key].module = name || va[key].module || '';
                // 保留资源键名作为id
                va[key].id = key;
            });
            return;
        }
        if (v.id && v.src && v.type) {
            mains.push(va);
            va.forEach((v) => {
                v.module = name || v.module || '';
            });
        }
    };
    insideModules.forEach((e) => {
        const ek = Object.keys(e);
        ek.forEach((k) => {
            if (k.includes && k.includes('_MANIFEST')) {
                const obj = e[k];
                const name = k.replace('_MANIFEST', '');
                if (Array.isArray(obj)) {
                    checkva(obj, '_' + name);
                } else if (Object.values(obj)[0].atlas) {
                    checkva(obj, name);
                } else {
                    Object.values(obj).forEach((e) => checkva(e, name));
                }
            }
        });
    });
    let mains_arr = mains.reduce((b, a) => a.concat(b), []);
    mains_arr = mains_arr.filter((e) => {
        if (mains_arr.find((p) => e.src === p.src) && e.module.startsWith('_')) {
            return false;
        }
        return true;
    });
    
    const spineres = {
        SPINE_MANIFEST: spines.reduce((b, a) => Object.assign(a, b), {}),
        MAIN_MANIFEST: mains_arr,
    };
    
    // 新增：将识别到的字符串atlas模块加入结果
    atlasModules.forEach(atlasModule => {
        const atlasName = atlasModule.atlasName || `atlas_${atlasModule.id}`;
        if (!spineres.SPINE_MANIFEST[atlasName]) {
            spineres.SPINE_MANIFEST[atlasName] = {
                atlas: atlasModule.content,
                id: atlasName,
                module: '_string_atlas',
                _moduleId: atlasModule.id
            };
        }
    });
    
    // 新增：将识别到的JSON模块加入结果
    jsonModules.forEach(jsonModule => {
        const jsonName = jsonModule.jsonName || `json_${jsonModule.id}`;
        if (!spineres.SPINE_MANIFEST[jsonName]) {
            spineres.SPINE_MANIFEST[jsonName] = {
                json: jsonModule.content,
                id: jsonName,
                module: '_json_module',
                _moduleId: jsonModule.id
            };
        }
    });
    
    console.log('[extractSpine] Final SPINE_MANIFEST:', spineres.SPINE_MANIFEST);
    return spineres;
}
function extractStaticFiles(modules, base) {
    const matches = [];
    const processedAtlasModules = new Set(); // 避免重复处理
    
    Object.keys(modules).forEach((k) => {
        if (processedAtlasModules.has(k)) return;
        
        const e = modules[k];
        const et = e.toString();
        
        // 原有逻辑
        const match = et.match(/[a-zA-Z0-9]\.exports\s?=\s?([a-zA-Z0-9]\.[a-zA-Z0-9]\s?\+)?\s?"(.*?)"/);
        if (match) {
            const url = match[2];
            let isAtlasContent = false;
            
            // 检测是否为atlas内容 - 改进的检测逻辑
            if (url.includes('size:') && url.includes('filter:') && 
                (url.includes('bounds:') || url.includes('rotate:'))) {
                isAtlasContent = true;
            }
            
            // 跳过非data URL且不是atlas内容的资源
            if (!url.startsWith('data:') && !match[1] && !isAtlasContent) {
                return;
            }
            
            let bname = basename(url);
            if (bname) {
                const a = bname.split('.');
                a.pop(); // remove extension
                if (a.length >= 2) {
                    // remove webpack hash
                    a.pop();
                }
                bname = a.join('.');
            } else {
                bname = k.replace(/\//g, '_').replace(/\./g, '_').replace(/\:/g, '_').replace(/\+/g, '_');
                
                // 特殊处理atlas内容
                if (isAtlasContent && url.includes('.png')) {
                    bname = url.split('\n')[0].trim().replace('.png', '');
                }
            }
            
            const resource = {
                id: bname,
                src: url.includes('data:') ? url : isAtlasContent ? 'atlas_content' : new URL(url, base).toString(),
                _module: k,
                isAtlasContent: isAtlasContent,
                atlasContent: isAtlasContent ? url : null
            };
            
            matches.push(resource);
            if (isAtlasContent) {
                processedAtlasModules.add(k);
            }
        }
    });
    
    return matches;
}
async function fetchToZip_(name, url) {
    const res = await fetch(url);
    const stream = () => res.body;
    return {
        name,
        stream,
    };
}
async function fetchToZip(name, url) {
    return limitP.call(fetchToZip_, name, url);
}
async function loadPageInIframe(url) {
    // fetch url and load by srcdoc
    const response = await fetch(url);
    let html = await response.text();
    if (html.includes('webpackJsonp')) {
        html = html.replace(new RegExp(`<script type="text/javascript">`, 'g'), `<script type="text/dontexecute">`);
    } else {
        let entrName = '';
        if (html.includes('Symbol.toStringTag') && html.includes('Object.defineProperty')) {
            // modified webpackjsonp name in html
            // parse to dom
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            const script = doc.querySelectorAll('script');
            script.forEach((s) => {
                if (s.src.includes('sentry') || s.textContent.includes('Sentry') || s.textContent.includes('firebase'))
                    s.type = 'text/dontexecute';
                if (s.textContent.includes('Symbol.toStringTag') && s.textContent.includes('Object.defineProperty')) {
                    s.type = 'text/dontexecute';
                    const matches = [...s.textContent.matchAll(/self\.(.*?)=self.(.*?)\|\|\[\]/g)];
                    for (const match of matches) {
                        if (match[1] == match[2]) {
                            if (entrName != '') {
                                alert(`Warning: Multiple entry points found: ${entrName} and ${match[1]}`);
                            }
                            entrName = match[1];
                        }
                    }
                }
            });
            html = doc.documentElement.outerHTML;
        }
        html = html.replace(
            `</head>`,
            `\<script\>
window.webpackJsonp_ = [];
window.cachedModules = [];
window.loadedModules = [];
window.webpackJsonpProxy = new Proxy(webpackJsonp_, {
get: (target, prop) => {
if (prop === 'push') {
    return (...args) => {
        console.log(args);
        cachedModules.push(...args);
    };
}
if (prop in target) {
    return target[prop];
}
return undefined;
},
set: (target, prop, value) => {
if (prop === 'push') {
    value(['inject',{
        inject(module, exports, __webpack_require__){
            loadedModules = __webpack_require__.m
        }
    },[['inject']]])
    console.log('set', prop, value);
    return true;
}
target[prop] = value;
return true;
},
});
Object.defineProperty(window, '${entrName || 'webpackJsonp'}', {
value: webpackJsonpProxy,
writable: true,
enumerable: false,
configurable: false,
});\</script\>`,
        );
    }
    let base = url;
    const matchVendors = html.match(/src="([^"]*?\/)vendors([^"]*?)js"/);
    console.log(matchVendors);
    if (matchVendors) {
        base = matchVendors[1];
    }
    if (!base.includes('://')) {
        base = new URL(base, url).toString();
    }
    html = html.replace('<head>', `<head><base href="${base}">`);
    const iframe = document.createElement('iframe');
    iframe.srcdoc = html;
    iframe.style.display = 'none';
    document.body.appendChild(iframe);
    return new Promise((resolve) => {
        iframe.onload = () => {
            resolve({ iframe, base });
        };
    });
}
const dirname = (path) => {
    const a = path.split('/');
    a.pop();
    return a.join('/');
};
async function extract(url) {
    try {
        btn.innerText = 'Fetching Page...';
        const { iframe: frame, base } = await loadPageInIframe(url);
        frame.contentWindow.regeneratorRuntime = regeneratorRuntime;
        btn.innerText = 'Extracting Data...';
        let modules = {};
        if (frame.contentWindow.cachedModules) {
            modules = {
                ...frame.contentWindow.loadedModules,
            };
            for (const i of frame.contentWindow.cachedModules) {
                modules = {
                    ...modules,
                    ...i[1],
                };
            }
        } else {
            const webpackJsonp = frame.contentWindow.webpackJsonp;
            console.log('found WebpackJsonp', webpackJsonp);
            const vendors = webpackJsonp.find((e) => e[0].includes('vendors'));
            if (!vendors) {
                btn.innerText = 'Load vendors.js faild!';
                return;
            }
            const Index = webpackJsonp.find((e) => e[0].includes('index'));
            if (!Index) {
                btn.innerText = 'Load index.js faild!';
                return;
            }
            const Runtime = webpackJsonp.find((e) => e[0].includes('runtime'));
            modules = { ...vendors[1], ...Index[1], ...(Runtime ? Runtime[1] : {}) };
        }
        const spineres = extractSpine(modules, new URL('.', base).toString(), frame.contentWindow);
        console.log('Got Spine Data', spineres);
        const staticres = extractStaticFiles(modules, new URL('.', base).toString());
        console.log('Got Static Files', staticres);
        
        // 合并atlas资源
        const allAtlasResources = [];
        // 收集json资源
        const allJsonResources = [];
        
        // 1. 从spineres.SPINE_MANIFEST获取
        Object.keys(spineres.SPINE_MANIFEST).forEach(name => {
            const item = spineres.SPINE_MANIFEST[name];
            
            // 检查是否为以资源名称为键的对象结构（如：{ "agelaiya_": { atlas: ..., json: ... } }）
            const keys = Object.keys(item);
            if (keys.length > 0 && item[keys[0]] && item[keys[0]].atlas !== undefined) {
                // 这是一个以资源名称为键的对象
                keys.forEach(key => {
                    const resource = item[key];
                    if (resource) {
                        // 收集atlas资源
                        if (resource.atlas && typeof resource.atlas === 'string' && resource.atlas.includes('size:')) {
                            allAtlasResources.push({
                                name: key,
                                content: resource.atlas,
                                dir: resource.module || '_spine'
                            });
                        }
                        
                        // 收集JSON资源
                        if (resource.json) {
                            allJsonResources.push({
                                name: key,
                                content: resource.json,
                                dir: resource.module || '_spine'
                            });
                        }
                    }
                });
            } else {
                // 处理普通结构
                if (item.atlas && typeof item.atlas === 'string' && item.atlas.includes('size:')) {
                    allAtlasResources.push({
                        name: name,
                        content: item.atlas,
                        dir: item.module || '_spine'
                    });
                }
                
                // 收集JSON资源
                if (item.json) {
                    allJsonResources.push({
                        name: name,
                        content: item.json,
                        dir: item.module || '_spine'
                    });
                }
            }
        });
        
        // 2. 从staticres获取
        staticres.forEach(item => {
            if (item.isAtlasContent && item.atlasContent) {
                const atlasName = item.id || `atlas_${item._module}`;
                allAtlasResources.push({
                    name: atlasName,
                    content: item.atlasContent,
                    dir: '_string_atlas'
                });
            }
        });
        
        // 3. 去重atlas资源
        const uniqueAtlasResources = [];
        const seenAtlasNames = new Set();
        allAtlasResources.forEach(atlas => {
            if (!seenAtlasNames.has(atlas.name)) {
                seenAtlasNames.add(atlas.name);
                uniqueAtlasResources.push(atlas);
            }
        });
        
        // 4. 去重JSON资源
        const uniqueJsonResources = [];
        const seenJsonNames = new Set();
        allJsonResources.forEach(json => {
            if (!seenJsonNames.has(json.name)) {
                seenJsonNames.add(json.name);
                uniqueJsonResources.push(json);
            }
        });
        
        console.log('[extract] All atlas resources to export:', uniqueAtlasResources);
        console.log('[extract] All json resources to export:', uniqueJsonResources);
        
        btn.innerText = 'Preparing resources...';
        const fn = (url.match(/event\/(.*?)\//) || ['', ''])[1].split('-')[0] || Date.now().toString();
        const fileStream = streamSaver.createWriteStream(fn + '.zip');
        const readableZipStream = new ZIP({
            async start(ctrl) {
                btn.innerText = 'Download started...';
                const savedIds = [];
                // save spine json & atlas
                for (const i of Object.keys(spineres.SPINE_MANIFEST)) {
                    const item = spineres.SPINE_MANIFEST[i];
                    
                    // 检查是否为以资源名称为键的对象结构
                    const keys = Object.keys(item);
                    if (keys.length > 0 && item[keys[0]] && item[keys[0]].atlas !== undefined) {
                        // 这是一个以资源名称为键的对象，跳过处理，因为已经在上面处理过了
                        continue;
                    } else {
                        // 处理普通结构
                        const dir = item.module || '_spine';
                        
                        // 跳过已处理的atlas内容
                        if (item.atlas && typeof item.atlas === 'string' && item.atlas.includes('size:')) {
                            continue;
                        }
                        
                        // 跳过已处理的json内容
                        if (item.json) {
                            continue;
                        }
                        
                        // 处理atlas
                        if (item.atlas) {
                            const atlas = new File([item.atlas], dir + '/' + i + '.atlas', {
                                type: 'text/plain',
                            });
                            ctrl.enqueue(atlas);
                        }
                        
                        // 处理json
                        if (item.json) {
                            const j = item.json;
                            if (typeof j === 'string' && j.indexOf('http') === 0) {
                                savedIds.push(j);
                                ctrl.enqueue(await fetchToZip(dir + '/' + i + '.json', j));
                            } else {
                                const json = new File([JSON.stringify(j, null, 4)], dir + '/' + i + '.json', {
                                    type: 'application/json',
                                });
                                ctrl.enqueue(json);
                            }
                        }
                    }
                }
                
                // 保存atlas文件 - 新增逻辑
                for (const atlas of uniqueAtlasResources) {
                    const atlasFile = new File([atlas.content], `${atlas.dir}/${atlas.name}.atlas`, {
                        type: 'text/plain',
                    });
                    ctrl.enqueue(atlasFile);
                    console.log(`[ZIP] Added atlas file: ${atlas.dir}/${atlas.name}.atlas`);
                }
                
                // 保存json文件
                for (const json of uniqueJsonResources) {
                    const jsonFile = new File([JSON.stringify(json.content, null, 4)], `${json.dir}/${json.name}.json`, {
                        type: 'application/json',
                    });
                    ctrl.enqueue(jsonFile);
                    console.log(`[ZIP] Added json file: ${json.dir}/${json.name}.json`);
                }
                
                // save images
                const promises = Object.values(spineres.MAIN_MANIFEST).map((e) => {
                    //skip things in savedIds
                    if (savedIds.includes(e.src)) {
                        return Promise.resolve();
                    }
                    const dir = e.module || '';
                    const fn = dir + '/' + e.id + '.' + extname(e.src);
                    savedIds.push(e.src);
                    return fetchToZip(fn, e.src).then((res) => ctrl.enqueue(res));
                });
                // save other static
                let otherlen = 0;
                const staticPromises = staticres.map((e) => {
                    //skip things in savedIds
                    if (savedIds.includes(e.src)) {
                        return Promise.resolve();
                    }
                    // Skip atlas content as they are handled separately
                    if (e.isAtlasContent) {
                        return Promise.resolve();
                    }
                    const dir = '_other_resources';
                    const fn = dir + '/' + e.id + '.' + extname(e.src);
                    savedIds.push(e.src);
                    otherlen++;
                    return fetchToZip(fn, e.src).then((res) => ctrl.enqueue(res));
                });
                desc.innerText =
                    `Extracted ${Object.keys(spineres.SPINE_MANIFEST).length} spine(s), ` +
                    `${Object.keys(spineres.MAIN_MANIFEST).length} render-related image(s), ` +
                    `${otherlen} other resource(s)`;
                await Promise.all(promises.concat(staticPromises));
                ctrl.close();
            },
        });
        if (window.WritableStream && readableZipStream.pipeTo) {
            await readableZipStream.pipeTo(fileStream);
            btn.innerText = 'Done';
        } else {
            btn.innerText = 'FileWriter Unsupported!';
        }
    } catch (e) {
        console.error('[extract] ERROR:', e);
        btn.innerText = 'Error!';
    }
}
async function clk() {
    btn.disabled = true;
    try {
        await extract(url.value);
    } catch (e) {
        console.error(e);
        btn.innerText = 'Error!';
    }
    btn.disabled = false;
}
