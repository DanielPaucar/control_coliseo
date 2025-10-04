-- CreateTable
CREATE TABLE `caja_turno` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `abierto` BOOLEAN NOT NULL DEFAULT true,
    `abiertoPor` VARCHAR(191) NULL,
    `cerradoPor` VARCHAR(191) NULL,
    `abiertoAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `cerradoAt` DATETIME(3) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `venta_adicional` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `codigoId` INTEGER NOT NULL,
    `cajaId` INTEGER NOT NULL,
    `precio` DECIMAL(10, 2) NOT NULL,
    `correo` VARCHAR(191) NULL,
    `enviadoPorCorreo` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `venta_adicional_codigoId_idx`(`codigoId`),
    INDEX `venta_adicional_cajaId_idx`(`cajaId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `configuracion` (
    `clave` VARCHAR(191) NOT NULL,
    `valor` VARCHAR(191) NOT NULL,
    `actualizadoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`clave`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `venta_adicional` ADD CONSTRAINT `venta_adicional_codigoId_fkey` FOREIGN KEY (`codigoId`) REFERENCES `codigoqr`(`id_codigo`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `venta_adicional` ADD CONSTRAINT `venta_adicional_cajaId_fkey` FOREIGN KEY (`cajaId`) REFERENCES `caja_turno`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
