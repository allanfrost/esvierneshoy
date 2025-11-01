<?php
declare(strict_types=1);

/**
 * Kopier denne fil til config.php og udfyld værdierne med dine egne
 * databaseoplysninger fra Simply.com-kontrolpanelet.
 */
const DB_HOST = 'mysqlXX.simply.com';
const DB_PORT = 3306;
const DB_NAME = 'din_database';
const DB_USER = 'dit_brugernavn';
const DB_PASSWORD = 'din_adgangskode';

/**
 * Tilladt oprindelse for CORS. Opdater til din egen domæne-URL.
 * Eksempel: 'https://esvierneshoy.com'
 */
const ALLOWED_ORIGIN = 'https://esvierneshoy.com';

/**
 * Opret det første login til statistikdashboardet.
 * Ved første besøg på /stats/ indsættes brugeren automatisk i databasen,
 * hvorefter login og password kan ændres via SQL (eller ved at opdatere her
 * og slette den eksisterende række).
 */
const STATS_DEFAULT_USER = 'admin';
const STATS_DEFAULT_PASSWORD = 'skift_mig_hurtigt';
