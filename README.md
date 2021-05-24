## @xccjh/vue3-theme-peel

vue3换肤插件

## 安装

> 支持vue-cli创建vue3项目,如vue3+typescript+ant/vant(支持`webpack v4.x`和`html-webpack-plugin v3.x`)

```bash
$ yarn add vue-theme-switch-webpack-plugin -D
```

## 使用
### 配置插件
```js
// vue.config.js
const ThemeSwitchPlugin = require('@xccjh/vue3-theme-peel')
const dev = process.env.NODE_ENV === 'development'
const publicPath = 'http://localhost:8089/';

module.exports = {
  chainWebpack: (config) => {
    const newLoader = {
      loader: ThemeSwitchPlugin.loader // 👈 替换掉默认的所有样式处理loader
    }
    ;['vue'].forEach((item) => {
      ['css', 'scss', 'sass', 'less', 'stylus'].forEach((style) => {
        const originUse = config.module.rule(style).oneOf(item).toConfig().use
        originUse.splice(0, 1, newLoader)
        config.module.rule(style).oneOf(item).uses.clear()
        config.module.rule(style).oneOf(item).merge({ use: originUse })
      })
    })
    if (!dev) {
      config.devtool('none')  // 👈 关掉css映射
      config
        .plugins.delete('extract-css')  //  👈 替换掉默认的extract-css插件
      config
        .plugin('ThemeSwitchPluginArgs')  // 👈 使用ThemeSwitchPlugin
        .use(ThemeSwitchPlugin, [{
          filename: 'static/css/[name].[hash:8].css',
          chunkFilename: 'static/css/[name].[contenthash:8].css'
        }]).before('optimize-css')
      config.optimization.minimizer('terser').tap(args => {  // 👈 关掉js映射
        args[0].sourceMap = false
        return args
      })
      config
          .plugin('ThemeSwitchPluginInject') //  👈 注入主题变量工具函数
          .use(ThemeSwitchPlugin.inject,[{
                publicPath  // 👈 配置动态加载的publicPath
            }])
    }else {
       config
        .plugin('ThemeSwitchPluginInject')
        .use(ThemeSwitchPlugin.inject)
    }
    config.plugin('html').tap(args => {
      const param = args[0]
      param.minify = {  // 👈 优化压缩
        removeComments: true,
        collapseWhitespace: true,
        removeAttributeQuotes: true
      }
      param.chunksSortMode = 'dependency'
      return [param]
    })
 
  }
}
```
### 组件使用
任意组件中使用theme标识区分不同的主题,开发环境动态生成style标签,生产环境动态加载link标签
```vue
<template>
  <div id="nav">
    <router-link to="/">Home</router-link> |
    <router-link to="/about">About</router-link>
  </div>
  <router-view/>
</template>

<style lang="less">  👈 没有标志默认会应用
#app {
  font-family: Avenir, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-align: center;
  color: #2c3e50;
}

#nav {
  padding: 30px;

}
</style>
<style lang="less" theme='dark'> // 👈 theme标志区分暗色主题,只用window.$theme.style === 'dark' 才会应用
  #nav {
    font-size: 60px;
  }
</style>
```
### 开发阶段
![hq-seeai-cli使用演示](https://xccjhzjh.oss-cn-hongkong.aliyuncs.com/xccjh-images/theme.gif)
### 线上环境
![hq-seeai-cli使用演示](https://xccjhzjh.oss-cn-hongkong.aliyuncs.com/xccjh-images/themelocal.gif)

## 原理

### 开发阶段
在开发阶段，对于vue项目，通用做法是将样式通过`vue-style-loader`提取出来，然后通过`<style>`标签动态插入DOM。

通过查看`vue-style-loader`的源码可知，样式`<style>`的插入与更新，是通过 `/lib/addStylesClient.js` 这个文件暴露出来的方法实现的。

首先，我们可以从`this.resourceQuery`解析出样式对应的主题名称，供后续样式插入的时候判断。

`options.theme = /\btheme=(\w+?)\b/.exec(this.resourceQuery) && RegExp.$1;`

这样，样式对应的主题名称就随着options对象一起传入到了addStylesClient方法中。

关于`this.resourceQuery`，可以查看webpack的文档。

然后，我们通过改写addStyle方法，根据当前主题加载对应的样式。同时，监听主题名称变化的事件，在回调函数中设置当前主题对应的样式并删除非当前主题的样式。

```js
if (options.theme && window.$theme) {
  // 初次加载时，根据主题名称加载对应的样式
  if (window.$theme.style === options.theme) {
    update(obj);
  }

  const { theme } = options;
  // 监听主题名称变化的事件，设置当前主题样式并删除非当前主题样式
  window.addEventListener('theme-change', function onThemeChange() {
    if (window.$theme.style === theme) {
      update(obj);
    } else {
      remove();
    }
  });

  // 触发hot reload的时候，调用updateStyle更新<style>标签内容
  return function updateStyle(newObj /* StyleObjectPart */) {
    if (newObj) {
      if (
        newObj.css === obj.css
        && newObj.media === obj.media
        && newObj.sourceMap === obj.sourceMap
      ) {
        return;
      }

      obj = newObj;
      if (window.$theme.style === options.theme) {
        update(obj);
      }
    } else {
      remove();
    }
  };
}
```
这样，当更改window.$theme.style时触发theme-change会动态处理不同主题style的产生和销毁,我们就支持了开发阶段多主题的切换。

### 线上环境

对于线上环境，因为我们可以使用`mini-css-extract-plugin`将css文件分chunk导出成多个css文件并动态加载，所以我们需要解决：如何按主题导出样式文件，如何动态加载，如何在html入口只加载当前主题的样式文件。

我们先简单介绍下mini-css-extract-plugin导出css样式文件的工作流程:
1. 第一步：在loader的pitch阶段，将样式转为dependency(该插件使用了一个扩展自webpack.Dependency的自定义CssDependency)；
2. 第二步：在plugin的renderManifest钩子中，调用renderContentAsset方法，用于自定义css文件的输出结果。该方法会将一个js模块依赖的多个样式输出到一个css文件当中。
3. 第三步：在entry的requireEnsure钩子中，根据chunkId找到对应的css文件链接，通过创建link标签实现动态加载。这里会在源码中插入一段js脚本用于动态加载样式css文件。
4. 接下来，html-webpack-plugin会将entry对应的css注入到html中，保障入口页面的样式渲染。

#### 按主题导出样式文件
我们需要改造renderContentAsset方法，在样式文件的合并逻辑中加入theme的判断。核心逻辑如下：

```js
const themes = [];

// eslint-disable-next-line no-restricted-syntax
for (const m of usedModules) {
  const source = new ConcatSource();
  const externalsSource = new ConcatSource();

  if (m.sourceMap) {
    source.add(
      new SourceMapSource(
        m.content,
        m.readableIdentifier(requestShortener),
        m.sourceMap,
      ),
    );
  } else {
    source.add(
      new OriginalSource(
        m.content,
        m.readableIdentifier(requestShortener),
      ),
    );
  }

  source.add('\n');

  const theme = m.theme || 'default';
  if (!themes[theme]) {
    themes[theme] = new ConcatSource(externalsSource, source);
    themes.push(theme);
  } else {
    themes[theme] = new ConcatSource(themes[theme], externalsSource, source);
  }
}

return themes.map((theme) => {
  const resolveTemplate = (template) => {
    if (theme === 'default') {
      template = template.replace(REGEXP_THEME, '');
    } else {
      template = template.replace(REGEXP_THEME, `$1${theme}$2`);
    }
    return `${template}?type=${MODULE_TYPE}&id=${chunk.id}&theme=${theme}`;
  };

  return {
    render: () => themes[theme],
    filenameTemplate: resolveTemplate(options.filenameTemplate),
    pathOptions: options.pathOptions,
    identifier: options.identifier,
    hash: options.hash,
  };
});
```

在这里我们定义了一个resolveTemplate方法，对输出的css文件名支持了[theme]这一占位符。同时，在我们返回的文件名中，带入了一串query，这是为了便于在编译结束之后，查询该样式文件对应的信息。

#### 动态加载样式css文件
这里的关键就是根据chunkId找到对应的css文件链接，在mini-css-extract-plugin的实现中，可以直接计算出最终的文件链接，但是在我们的场景中却不适用，因为在编译阶段，我们不知道要加载的theme是什么。一种可行的思路是，插入一个resolve方法，在运行时根据当前theme解析出完整的css文件链接并插入到DOM中。这里我们使用了另外一种思路：收集所有主题的css样式文件地址并存在一个map中，在动态加载时，根据chunkId和theme从map中找出最终的css文件链接。

以下是编译阶段注入代码的实现：
```js
compilation.mainTemplate.hooks.requireEnsure.tap(
  PLUGIN_NAME,
  (source) => webpack.Template.asString([
    source,
    '',
    `// ${PLUGIN_NAME} - CSS loading chunk`,
    '$theme.__loadChunkCss(chunkId)', 
  ]),
);
```

以下是在运行阶段根据chunkId加载css的实现：
```js
function loadChunkCss(chunkId) {
  const id = `${chunkId}#${theme.style}`;
  if (resource && resource.chunks) {
    util.createThemeLink(resource.chunks[id]);
  }
}
```

#### 注入entry对应的css文件链接

因为分多主题之后，entry可能会根据多个主题产生多个css文件，这些都会注入到html当中，所以我们需要删除非默认主题的css文件引用。html-webpack-plugin提供了钩子帮助我们进行这些操作。注册alterAssetTags钩子的回调，可以把所有非默认主题对应的link标签删去：

```js
compilation.hooks.htmlWebpackPluginAlterAssetTags.tapAsync(PLUGIN_NAME, (data, callback) => {
  data.head = data.head.filter((tag) => {
    if (tag.tagName === 'link' && REGEXP_CSS.test(tag.attributes && tag.attributes.href)) {
      const url = tag.attributes.href;
      if (!url.includes('theme=default')) return false;
      // eslint-disable-next-line no-return-assign
      return !!(tag.attributes.href = url.substring(0, url.indexOf('?')));
    }
    return true;
  });
  data.plugin.assetJson = JSON.stringify(
    JSON.parse(data.plugin.assetJson)
      .filter((url) => !REGEXP_CSS.test(url) || url.includes('theme=default'))
      .map((url) => (REGEXP_CSS.test(url) ? url.substring(0, url.indexOf('?')) : url)),
  );

  callback(null, data);
});
```

#### 获取和设置当前主题
通过Object.defineProperty拦截当前主题的取值和赋值操作触发theme-change，t同时可以将用户选择的主题值存在本地缓存，下次打开页面的时候就是当前设置的主题了。
```js
const theme = {};
Object.defineProperties(theme, {
  style: {
    configurable: true,
    enumerable: true,
    get() {
      return store.get();
    },
    set(val) {
      const oldVal = store.get();
      const newVal = String(val || 'default');
      if (oldVal === newVal) return;
      store.set(newVal);
      window.dispatchEvent(new CustomEvent('theme-change', { bubbles: true, detail: { newVal, oldVal } }));
    },
  },
});
```

#### 加载主题对应的css文件
动态加载css文件通过js创建link标签的方式即可实现，唯一需要注意的点是，切换主题后link标签的销毁操作。考虑到创建好的link标签本质上也是个对象，还记得我们之前存css样式文件地址的map吗？创建的link标签对象的引用也可以存在这个map上，这样就能够快速找到主题对应的link标签了。
```js
const resource = window.$themeResource;

// NODE_ENV = production
if (resource) {
  // 加载entry
  const currentTheme = theme.style;
  if (resource.entry && currentTheme && currentTheme !== 'default') {
    Object.keys(resource.entry).forEach((id) => {
      const item = resource.entry[id];
      if (item.theme === currentTheme) {
        util.createThemeLink(item);
      }
    });
  }

  // 更新theme
  window.addEventListener('theme-change', (e) => {
    const newTheme = e.detail.newVal || 'default';
    const oldTheme = e.detail.oldVal || 'default';

    const updateThemeLink = (obj) => {
      if (obj.theme === newTheme && newTheme !== 'default') {
        util.createThemeLink(obj);
      } else if (obj.theme === oldTheme && oldTheme !== 'default') {
        util.removeThemeLink(obj);
      }
    };

    if (resource.entry) {
      Object.keys(resource.entry).forEach((id) => {
        updateThemeLink(resource.entry[id]);
      });
    }

    if (resource.chunks) {
      Object.keys(resource.chunks).forEach((id) => {
        updateThemeLink(resource.chunks[id]);
      });
    }
  });
}
```

#### 最后
我们通过webpack的loader和plugin，把样式文件按主题切分成了单个的css文件；并通过一个单独的模块实现了entry和chunk对应主题css文件的加载和主题动态切换。接下来需要做的就是，注入css资源列表到一个全局变量上，以便window.$theme可以通过这个全局变量去查找样式css文件。
这一步我们依然使用html-webpack-plugin提供的钩子来帮助我们完成：
```js
compilation.hooks.htmlWebpackPluginAfterHtmlProcessing.tapAsync(PLUGIN_NAME, (data, callback) => {
  const resource = { entry: {}, chunks: {} };
  Object.keys(compilation.assets).forEach((file) => {
    if (REGEXP_CSS.test(file)) {
      const query = loaderUtils.parseQuery(file.substring(file.indexOf('?')));
      const theme = { id: query.id, theme: query.theme, href: file.substring(0, file.indexOf('?')) };
      if (data.assets.css.indexOf(file) !== -1) {
        resource.entry[`${theme.id}#${theme.theme}`] = theme;
      } else {
        resource.chunks[`${theme.id}#${theme.theme}`] = theme;
      }
    }
  });

  data.html = data.html.replace(/(?=<\/head>)/, () => {
    const script = themeScript.replace('window.$themeResource', JSON.stringify(resource));
    return `<script>${script}</script>`;
  });

  callback(null, data);
});

```

#### 实现主题切换
控制台或代码中执行:
```js
window.$theme.style ='xxx'; // 👈  会触发theme-change从而根据开发或者生产环境去对应获取主题
```
