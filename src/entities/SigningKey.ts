import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from "typeorm";

@Entity()
export class SigningKey {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  fingerprint: string;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ type: "datetime" })
  expiresAt: Date;

  @Column({ default: true })
  isActive: boolean;
}
