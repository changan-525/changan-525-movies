# 光影拾遗

一个无需账号、API 密钥或后端服务的中文免费影片搜索页面。它查询两个来源的公开目录，并把用户带到来源网站查看影片：

- [互联网档案馆 Feature Films](https://archive.org/details/feature_films)
- [美国国会图书馆 National Screening Room](https://www.loc.gov/collections/national-screening-room/)

支持关键词搜索、来源筛选、加载更多和可分享的搜索链接。界面为中文，来源元数据多为英文，因此英文片名、人名或主题词通常更容易命中。结果会随来源网站的目录更新而变化。

## 运行

项目是纯静态网页。在项目目录运行：

    py -3 -m http.server 8000

然后打开 http://localhost:8000 。也可以将仓库通过 GitHub Pages 发布：在仓库设置的 Pages 页面选择从主分支根目录部署。

## 数据与使用说明

搜索分别使用[互联网档案馆搜索接口](https://archive.org/developers)和[美国国会图书馆 JSON API](https://www.loc.gov/apis/json-and-yaml/)。页面直接向这两个来源发起请求，不收集用户输入，也不提供影片下载、转存或代理播放。

展示在目录中的作品并不代表它可以在所有地区播放或自由复制、再利用。打开原始条目后，请以来源网站提供的播放状态和权利说明为准。美国国会图书馆对 [National Screening Room 的权利说明](https://www.loc.gov/collections/national-screening-room/about-this-collection/rights-and-access/)有专门介绍。

## 文件

- index.html：页面结构和中文文案
- styles.css：响应式界面样式
- app.js：来源查询、结果整理和交互
