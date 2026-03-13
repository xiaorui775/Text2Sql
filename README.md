# Text2SQL - AI 数据库设计助手

Text2SQL 是一款智能开发工具，能够将自然语言需求转化为专业的数据库设计方案。只需描述您的业务需求，即可一键生成实体关系（ER）图和 SQL 脚本。

## ✨ 主要功能

- **自然语言分析**：深度理解复杂的业务需求，自动提取实体、字段及关系。
- **可视化 ER 图**：自动生成交互式 ER 图，支持动态布局调整。
- **多数据库支持**：支持生成 MySQL, PostgreSQL, SQLite, MariaDB 等多种数据库的 SQL 语句。
- **一键导出**：支持将 ER 图导出为高清 PNG 图片。
- **历史记录**：自动保存设计历史，方便随时回溯和查看过往方案。
- **灵活配置**：支持 OpenAI 兼容的 LLM 服务商，可自定义模型参数。

## 🛠️ 技术栈

- **框架**: [Next.js 14+](https://nextjs.org/) (App Router)
- **语言**: [TypeScript](https://www.typescriptlang.org/)
- **样式**: [Tailwind CSS](https://tailwindcss.com/) & [Shadcn UI](https://ui.shadcn.com/)
- **数据库**: [SQLite](https://www.sqlite.org/) (本地存储)
- **ORM**: [Prisma](https://www.prisma.io/)
- **图标**: [Lucide React](https://lucide.dev/)

## 🚀 快速开始

### 环境要求

- Node.js 18+
- pnpm (推荐) 或 npm

### 安装步骤

1. **克隆项目**
   ```bash
   git clone https://github.com/xiaorui775/Text2Sql.git
   cd text2sql
   ```

2. **安装依赖**
   ```bash
   pnpm install
   # 或
   npm install
   ```

3. **启动开发服务器**
   ```bash
   # 数据库初始化将在启动时自动进行
   npm run dev
   # 或
   pnpm dev
   ```

4. 在浏览器中打开 [http://localhost:3000](http://localhost:3000)。

## ⚙️ 配置说明

1. 点击右上角的 **设置** 图标。
2. 配置您的 LLM 服务商（如 OpenAI 或自定义接口）。
3. 输入 **API Key** 并选择模型（如 gpt-4o-mini）。
4. 选择目标数据库类型（MySQL, PostgreSQL 等）。

## 📄 许可证

本项目采用 MIT 许可证。
