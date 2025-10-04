-- CreateTable
CREATE TABLE `persona` (
    `id_persona` INTEGER NOT NULL AUTO_INCREMENT,
    `nombre` VARCHAR(191) NOT NULL,
    `apellido` VARCHAR(191) NULL,
    `cedula` VARCHAR(191) NULL,
    `correo` VARCHAR(191) NULL,
    `tipo_persona` ENUM('estudiante', 'familiar', 'visitante') NOT NULL,
    `estado` BOOLEAN NOT NULL DEFAULT true,

    UNIQUE INDEX `persona_cedula_key`(`cedula`),
    PRIMARY KEY (`id_persona`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `codigoqr` (
    `id_codigo` INTEGER NOT NULL AUTO_INCREMENT,
    `codigo` VARCHAR(191) NOT NULL,
    `tipo_qr` ENUM('est', 'fam', 'vis') NOT NULL,
    `max_usos` INTEGER NOT NULL DEFAULT 1,
    `usos_actual` INTEGER NOT NULL DEFAULT 0,
    `personaId` INTEGER NULL,

    UNIQUE INDEX `codigoqr_codigo_key`(`codigo`),
    INDEX `codigoqr_personaId_fkey`(`personaId`),
    PRIMARY KEY (`id_codigo`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ingreso` (
    `id_ingreso` INTEGER NOT NULL AUTO_INCREMENT,
    `fecha` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `codigoqrId` INTEGER NOT NULL,

    INDEX `ingreso_codigoqrId_fkey`(`codigoqrId`),
    PRIMARY KEY (`id_ingreso`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `importacion` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `archivo` VARCHAR(191) NOT NULL,
    `usuario` VARCHAR(191) NULL,
    `fecha` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `total_registros` INTEGER NOT NULL DEFAULT 0,
    `exitosos` INTEGER NOT NULL DEFAULT 0,
    `fallidos` INTEGER NOT NULL DEFAULT 0,
    `errores` JSON NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `codigoqr` ADD CONSTRAINT `codigoqr_personaId_fkey` FOREIGN KEY (`personaId`) REFERENCES `persona`(`id_persona`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ingreso` ADD CONSTRAINT `ingreso_codigoqrId_fkey` FOREIGN KEY (`codigoqrId`) REFERENCES `codigoqr`(`id_codigo`) ON DELETE RESTRICT ON UPDATE CASCADE;

