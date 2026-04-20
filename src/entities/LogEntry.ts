import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from "typeorm";

@Entity()
export class LogEntry {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @CreateDateColumn()
  timestamp: Date;

  @Column()
  level: "info" | "warn" | "error";

  @Column()
  clientHostname: string;

  @Column()
  packageName: string;

  @Column({ type: "text" })
  message: string;
}
