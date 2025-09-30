/*
  Warnings:

  - You are about to drop the column `apellido` on the `codigoqr` table. All the data in the column will be lost.
  - You are about to drop the column `nombre` on the `codigoqr` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE `codigoqr` DROP COLUMN `apellido`,
    DROP COLUMN `nombre`;
