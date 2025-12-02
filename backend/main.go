package main

import (
	"log"
	"os"

	"reactflow-yjs/backend/handlers"

	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"
)

func main() {
	e := echo.New()

	// ミドルウェア設定
	e.Use(middleware.Logger())
	e.Use(middleware.Recover())
	e.Use(middleware.CORS())

	// 静的ファイルの配信（開発用）
	e.Static("/", "../frontend/dist")

	// WebSocketエンドポイント（room名付き）
	e.GET("/ws/:room", handlers.HandleWebSocket)

	// サーバー起動
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	log.Printf("Server starting on port %s", port)
	if err := e.Start(":" + port); err != nil {
		log.Fatal(err)
	}
}

