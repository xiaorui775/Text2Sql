# Text2SQL - AI-Powered Database Design Assistant

Text2SQL is an intelligent development tool that transforms natural language requirements into professional database designs. Simply describe your business needs, and it instantly generates Entity-Relationship (ER) diagrams and SQL scripts.

## ✨ Features

- **Natural Language Analysis**: Understands complex business requirements and extracts entities, fields, and relationships.
- **Visual ER Diagrams**: Auto-generates interactive ER diagrams with dynamic layout.
- **Multi-Database Support**: Generates SQL for MySQL, PostgreSQL, SQLite, and MariaDB.
- **Export Capabilities**: One-click export of ER diagrams to high-quality PNG images.
- **History Management**: Automatically saves your design history for easy retrieval and review.
- **Customizable AI**: Supports OpenAI-compatible LLM providers with configurable model parameters.

## 🛠️ Tech Stack

- **Framework**: [Next.js 14+](https://nextjs.org/) (App Router)
- **Language**: [TypeScript](https://www.typescriptlang.org/)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/) & [Shadcn UI](https://ui.shadcn.com/)
- **Database**: [SQLite](https://www.sqlite.org/) (Local storage)
- **ORM**: [Prisma](https://www.prisma.io/)
- **Icons**: [Lucide React](https://lucide.dev/)

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- pnpm (recommended) or npm

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/text2sql.git
   cd text2sql
   ```

2. **Install dependencies**
   ```bash
   pnpm install
   # or
   npm install
   ```

3. . **Run the development server**
   ```bash
   npm run dev
   # or
   pnpm dev
   ```

5. Open [http://localhost:3000](http://localhost:3000) with your browser.

## ⚙️ Configuration

1. Click the **Settings** icon in the top right corner.
2. Configure your LLM provider (e.g., OpenAI, custom).
3. Enter your **API Key** and select your preferred model (e.g., gpt-4o-mini).
4. Choose your target database type (MySQL, PostgreSQL, etc.).

## 📄 License

This project is licensed under the MIT License.
