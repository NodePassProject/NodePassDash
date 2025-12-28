package main

import (
	dbPkg "NodePassDash/internal/db"
	log "NodePassDash/internal/log"
	"flag"
	"fmt"
	"os"
	"time"

	"gorm.io/gorm"
)

func main() {
	dedupTrafficHourly := flag.Bool("dedup-traffic-hourly", false, "去重 traffic_hourly_summary 并创建唯一索引")
	onlyCreateIndexes := flag.Bool("create-indexes", false, "仅创建优化索引（不去重）")
	flag.Parse()

	if !*dedupTrafficHourly && !*onlyCreateIndexes {
		fmt.Fprintln(os.Stderr, "Usage:")
		fmt.Fprintln(os.Stderr, "  dbtool --dedup-traffic-hourly")
		fmt.Fprintln(os.Stderr, "  dbtool --create-indexes")
		os.Exit(2)
	}

	db := dbPkg.GetDB()
	if db == nil {
		log.Error("获取数据库连接失败")
		os.Exit(1)
	}

	start := time.Now()

	if *dedupTrafficHourly {
		log.Info("[dbtool]开始去重 traffic_hourly_summary ...")
		if err := db.Transaction(func(tx *gorm.DB) error {
			res := tx.Exec(`
				DELETE FROM traffic_hourly_summary
				WHERE id NOT IN (
					SELECT MAX(id)
					FROM traffic_hourly_summary
					GROUP BY hour_time, endpoint_id, instance_id
				)
			`)
			if res.Error != nil {
				return res.Error
			}
			log.Infof("[dbtool]traffic_hourly_summary 去重删除 %d 行", res.RowsAffected)
			return nil
		}); err != nil {
			log.Errorf("[dbtool]去重失败: %v", err)
			os.Exit(1)
		}
	}

	if *dedupTrafficHourly || *onlyCreateIndexes {
		log.Info("[dbtool]创建/校验索引 ...")
		if err := db.Transaction(func(tx *gorm.DB) error {
			stmts := []string{
				"CREATE UNIQUE INDEX IF NOT EXISTS uniq_traffic_hourly_summary_hour_endpoint_instance ON traffic_hourly_summary(hour_time, endpoint_id, instance_id)",
				"CREATE INDEX IF NOT EXISTS idx_service_history_instance_time ON service_history(instance_id, record_time)",
				"CREATE INDEX IF NOT EXISTS idx_service_history_endpoint_instance_time ON service_history(endpoint_id, instance_id, record_time)",
			}
			for _, sql := range stmts {
				if err := tx.Exec(sql).Error; err != nil {
					return err
				}
			}
			return nil
		}); err != nil {
			log.Errorf("[dbtool]创建索引失败: %v", err)
			os.Exit(1)
		}
	}

	log.Infof("[dbtool]完成，耗时: %v", time.Since(start))
}
