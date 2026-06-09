# Music PPT Agent

小学音乐教师 PPT 生成 Agent。当前目标是先用 CLI 验证能力：基于 Pi agent runtime，按 PPT Master 的原生 PPTX 管线思想生成可编辑 PowerPoint，而不是通用 Agent 临时调用一个 PPT skill。

## 当前能力

- 从一句课题请求生成小学音乐教学 PPTX，例如 `做一年级下册《温暖的家》的教学PPT`。
- 读取本地教材 PDF，建立可复用课本索引，只在生成时渲染需要的教材页。
- 读取指导思想/课程资料 PDF，抽取为隐藏教学约束，不把政策或课标术语放到学生页。
- 生成 PPT Master-style SVG 项目，并通过可配置的 `svg_to_pptx.py` 导出原生、可编辑 PPTX。
- 支持生成后立即运行 OOXML package audit 和 LibreOffice/Poppler 视觉 review。
- 支持音频/视频嵌入与 PPTX package 级媒体审计。

## 环境要求

- Node.js `>=22.19.0`
- npm
- PPT Master 的 `skills/ppt-master/scripts/svg_to_pptx.py`
- 可选但建议安装：LibreOffice、Poppler `pdftoppm`、Python/Pillow，用于 `--review` 视觉检查

安装依赖：

```bash
npm install --ignore-scripts
```

## 快速开始

源码仓库内使用 `npm run music-ppt --` 调 CLI。构建或安装 package 后可直接使用 `music-ppt`。

```bash
npm run music-ppt -- init

npm run music-ppt -- sources add guidance /path/to/guidance-1.pdf \
  --id guidance-1 \
  --title "教学指导"

npm run music-ppt -- sources add textbook /path/to/textbook.pdf \
  --id yue-grade1-volume2 \
  --title "粤教版一年级下册" \
  --publisher "粤教版" \
  --grade "一年级" \
  --volume "下册"

npm run music-ppt -- config set ppt-master /path/to/ppt-master/skills/ppt-master/scripts/svg_to_pptx.py
npm run music-ppt -- doctor

npm run music-ppt -- pptx "做一年级下册《温暖的家》的教学PPT" \
  --rebuild \
  --audit \
  --review
```

`--rebuild` 会在生成前从已登记 sources 刷新指导思想索引和教材索引。`--audit` 会检查 PPTX 结构、页数、禁用学生页术语和媒体 package。`--review` 会把 PPTX 通过 LibreOffice 渲染成图片并生成 contact sheet。
`doctor` 会检查项目初始化、PPT Master exporter、已索引教材数量和视觉 review 依赖；只有 exporter 可用且至少有一本教材已索引时才报告 ready。

输出位于：

```text
.pi/presentation/projects/<project-id>/
  lesson-plan.md
  storyboard.json
  media-manifest.json
  svg_output/
  exports/<project-id>.pptx
  exports/<project-id>.pptx.audit/
  exports/<project-id>.pptx.review/
```

## 常用命令

```bash
npm run music-ppt -- sources status
npm run music-ppt -- guidance rebuild
npm run music-ppt -- index rebuild
npm run music-ppt -- index inspect "温暖的家"
npm run music-ppt -- plan "做一年级下册《温暖的家》的教学PPT"
npm run music-ppt -- svg "做一年级下册《温暖的家》的教学PPT"
npm run music-ppt -- audit .pi/presentation/projects/<project-id>/exports/<project-id>.pptx
npm run music-ppt -- review .pi/presentation/projects/<project-id>/exports/<project-id>.pptx
```

## 项目结构

```text
packages/presentation/
  src/cli/                 # music-ppt CLI
  src/project/             # .pi/presentation 初始化、配置、sources
  src/curriculum/          # 指导思想抽取、禁用学生页术语
  src/textbooks/           # PDF 文本抽取、教材索引、课题解析
  src/lesson/              # lesson context 与 request normalization
  src/storyboard/          # 音乐课 storyboard
  src/svg/                 # PPT Master-style SVG 项目与导出适配
  src/ooxml/               # PPTX package writer
  src/media/               # 音视频嵌入与 manifest
  src/qa/                  # PPTX audit 与 visual review

packages/coding-agent/
  src/core/builtin-extensions/presentation.ts
  docs/presentation.md
```

## 和 Pi 的关系

这个仓库是基于 Pi monorepo 二次开发的专用产品。底层 agent runtime、coding-agent 集成和部分 package 命名仍保留 Pi 结构，便于持续吸收 Pi 的 agent 能力；面向用户的产品入口是 `music-ppt`，目标不是通用 coding agent，而是小学音乐教师 PPT 生成工具。

## 开发命令

```bash
npm run check
cd packages/presentation
node ../../node_modules/vitest/dist/cli.js --run test/cli/music-ppt-cli.test.ts
```

仓库规则见 `AGENTS.md`。代码改动后运行 `npm run check`；不要用 `git add .` 或 `git add -A`，只提交本次修改的明确路径。
