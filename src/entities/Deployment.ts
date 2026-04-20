import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from "typeorm";

@Entity()
export class Deployment {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  packageId: string;

  @Column()
  packageName: string;

  @Column()
  version: string;

  @Column({ default: 0 })
  targetCount: number;

  @Column({ default: 0 })
  successCount: number;

  @Column({ default: 0 })
  failedCount: number;

  @Column({ default: "pending" })
  status: "pending" | "running" | "success" | "failed";

  @CreateDateColumn()
  createdAt: Date;

  @Column({ type: "datetime", nullable: true })
  completedAt: Date | null;
}
