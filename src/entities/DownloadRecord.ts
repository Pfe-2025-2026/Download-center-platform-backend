import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from "typeorm";

// Tracks individual package downloads for dashboard analytics
// P2 populates this when a client downloads a package; P3 queries it for the dashboard
@Entity()
export class DownloadRecord {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  packageId: string;

  @Column({ nullable: true })
  clientId: string;

  @CreateDateColumn()
  downloadedAt: Date;
}
