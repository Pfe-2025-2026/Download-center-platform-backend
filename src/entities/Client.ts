import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from "typeorm";

@Entity()
export class Client {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ unique: true })
  hostname: string;

  @Column()
  ip: string;

  @Column()
  os: string;

  @Column()
  architecture: string;

  @Column({ type: "datetime" })
  lastSeen: Date;

  @Column({ nullable: true })
  currentVersion: string;

  @Column({ default: "online" })
  status: "online" | "offline" | "outdated";

  @Column({ unique: true })
  apiKey: string;

  @CreateDateColumn()
  createdAt: Date;
}
