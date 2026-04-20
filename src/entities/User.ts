import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from "typeorm";

// ── P1 STUB ── Person 1 will implement the full User entity with bcrypt hashing
@Entity()
export class User {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ unique: true })
  email: string;

  @Column()
  password: string;

  @Column()
  name: string;

  @Column({ default: "viewer" })
  role: "admin" | "viewer";

  @CreateDateColumn()
  createdAt: Date;
}
