import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from "typeorm";

// ── P2 STUB ── Person 2 will implement the full entity with file handling fields
@Entity()
export class SoftwarePackage {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ unique: true })
  name: string;

  @Column({ type: "text", default: "" })
  description: string;

  @Column({ type: "simple-json", default: "[]" })
  architectures: string[];

  @Column({ nullable: true })
  latestVersion: string;

  @Column({ nullable: true })
  size: string;

  @Column({ default: "active" })
  status: "active" | "draft" | "archived";

  @Column({ nullable: true })
  gpgFingerprint: string;

  @Column({ default: "valid" })
  gpgStatus: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
