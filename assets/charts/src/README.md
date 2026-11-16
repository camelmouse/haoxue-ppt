# 把源 PPT 放这里

将含图表的 `.pptx` 放进本目录（可建子目录），然后在项目根目录执行：

```bash
node scripts/chart-index.js assets/charts/src --out assets/charts/index.json
node scripts/chart-find.js --type bar
```

扫描结果包含：来源文件、页码、图表类型、标题、分类、系列、配色、
是否可编辑、数据是否可改。索引文件可随时重建，不必手工维护。

注意：源 PPT 可能含涉密或受版权保护的内容，入库前请自行确认授权范围。
