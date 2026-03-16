export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
      <div className="text-center space-y-3">
        <h1 className="text-2xl font-semibold">页面不存在</h1>
        <p className="text-muted-foreground">请返回首页继续使用 Text2SQL</p>
      </div>
    </div>
  )
}
