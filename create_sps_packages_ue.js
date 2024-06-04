/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 */
define(['N/runtime', 'N/format', 'N/record'], (nRuntime, nFormat, nRecord) => {

    const DEFAULT_SPS_PACKAGE_DEFINITION = 1;

    const afterSubmit = context => {
         if (context.type !== context.UserEventType.CREATE || nRuntime.executionContext !== nRuntime.ContextType.WEBSERVICES) {
             return;
        }
        //if (context.type !== context.UserEventType.CREATE && context.type !== context.UserEventType.EDIT) {
            //return;
        //}

        const newRecord = nRecord.load({
            type: context.newRecord.type,
            id: context.newRecord.id,
            isDynamic: true
        });

         const entityId = newRecord.getValue({ fieldId: 'entity' });
         if (entityId != 322136) {
             return;  // iHerb only
         }

         const newShipStataus = newRecord.getValue({ fieldId: 'shipstatus' });
         if (newShipStataus !== 'C') {
             return;
         }

        try {
            const packageDefinition = nRuntime.getCurrentScript().getParameter({ name: 'custscript_serp_ue_create_package_def' });
            if (!packageDefinition) {
                throw {
                    name: 'NO_PACKAGE_DEFINITION',
                    message: 'Please make sure that the parameter PACKAGE DEFINITION is set on the script deployment.'
                };
            }

            const lineCount = newRecord.getLineCount({ sublistId: 'item' });
            const ifId = newRecord.id;
            let isItemRecieve;
            let location;
            let line;
            let itemType;
            let kitMemberOf;
            let quantity;
            let packageId;
            let packageContentId;
            let inventoryDetailId;
            let inventoryDetails;

            const packages = [];
            let package;
            let weight;
            let trackingNumber;
            let packageLineCount;
            let packageSublistId;
            let packageWeightFieldId;
            let packageTrackingNumberFieldId;
            if (newRecord.getLineCount({ sublistId: 'package' })) {
                packageLineCount = newRecord.getLineCount({ sublistId: 'package' });
                packageSublistId = 'package';
                packageWeightFieldId = 'packageweight';
                packageTrackingNumberFieldId = 'packagetrackingnumber';
            } else if (newRecord.getLineCount({ sublistId: 'packagefedex' })) {
                packageLineCount = newRecord.getLineCount({ sublistId: 'packagefedex' });
                packageSublistId = 'packagefedex';
                packageWeightFieldId = 'packageweightfedex';
                packageTrackingNumberFieldId = 'packagetrackingnumberfedex';
            } else if (newRecord.getLineCount({ sublistId: 'packageups' })) {
                packageLineCount = newRecord.getLineCount({ sublistId: 'packageups' });
                packageSublistId = 'packageups';
                packageWeightFieldId = 'packageweightups';
                packageTrackingNumberFieldId = 'packagetrackingnumberups';
            }
            for (let i = 0; i < packageLineCount; i++) {
                weight = newRecord.getSublistValue({ sublistId: packageSublistId, fieldId: packageWeightFieldId, line: i });
                trackingNumber = newRecord.getSublistValue({ sublistId: packageSublistId, fieldId: packageTrackingNumberFieldId, line: i });
                if (trackingNumber) {
                    packages.push({ weight, trackingNumber });
                }
            }

            for (let i = 0; i < lineCount; i++) {
                isItemRecieve = newRecord.getSublistValue({ sublistId: 'item', fieldId: 'itemreceive', line: i });
                log.debug({ title: 'isItemRecieve', details: isItemRecieve });
                if (isItemRecieve) {
                    location = newRecord.getSublistValue({ sublistId: 'item', fieldId: 'location', line: i });
                    quantity = newRecord.getSublistValue({ sublistId: 'item', fieldId: 'quantity', line: i });
                    if (packages.length) {
                        package = packages[i % packages.length];
                    }
                    packageId = createSPSPackage({
                        ifId,
                        quantity,
                        location,
                        packageDefinition,
                        package
                    });

                    itemType = newRecord.getSublistValue({ sublistId: 'item', fieldId: 'itemtype', line: i });
                    log.debug({ title: 'itemType', details: itemType });
                    if (itemType === 'Kit') {
                        // Assume all succeeding items are kit members.
                        // Only stop if the property "kitmemberof" is not set or it's the end of the list.
                        do {
                            i++;
                            inventoryDetailId = newRecord.getSublistValue({ sublistId: 'item', fieldId: 'inventorydetail', line: i });
                            if (inventoryDetailId) {
                                inventoryDetails = getInventoryDetails(newRecord, i);
                            }
                            kitMemberOf = newRecord.getSublistValue({ sublistId: 'item', fieldId: 'kitmemberof', line: i });
                            line = newRecord.getSublistValue({ sublistId: 'item', fieldId: 'line', line: i });
                            packageContentId = createSPSPackageContent({
                                packageId,
                                ifId,
                                line,
                                item: newRecord.getSublistValue({ sublistId: 'item', fieldId: 'item', line: i }),
                                quantity: newRecord.getSublistValue({ sublistId: 'item', fieldId: 'quantity', line: i }),
                                packageDefinition,
                                inventoryDetails
                            });
                            log.debug({ title: `line ${line} - [packageId, packageContentId]`, details: [packageId, packageContentId] });
                            kitMemberOf = (i + 1) < lineCount ?
                                            newRecord.getSublistValue({ sublistId: 'item', fieldId: 'kitmemberof', line: i + 1 }) :
                                            null;
                            log.debug({ title: `kitMemberOf: ${kitMemberOf}`, details: !isNaN(parseInt(kitMemberOf)) });
                        } while (!isNaN(parseInt(kitMemberOf)));
                    } else {
                        if (i < lineCount) {
                            inventoryDetailId = newRecord.getSublistValue({ sublistId: 'item', fieldId: 'inventorydetail', line: i });
                            if (inventoryDetailId) {
                                inventoryDetails = getInventoryDetails(newRecord, i);
                            }
                            line = newRecord.getSublistValue({ sublistId: 'item', fieldId: 'line', line: i });
                            packageContentId = createSPSPackageContent({
                                packageId,
                                ifId,
                                line,
                                item: newRecord.getSublistValue({ sublistId: 'item', fieldId: 'item', line: i }),
                                quantity: newRecord.getSublistValue({ sublistId: 'item', fieldId: 'quantity', line: i }),
                                packageDefinition,
                                inventoryDetails
                            });
                            log.debug({ title: `line ${line} - [packageId, packageContentId]`, details: [packageId, packageContentId] });
                        }
                    }
                }
            }
            if (packages.length > 0) {
                const trackingNumbers = packages.map(p => p.trackingNumber);
                nRecord.setValue({ fieldId: 'custbody_sps_billofladingnumber', value: trackingNumbers.join(',') });
                nRecord.setValue({ fieldId: 'custbody_sps_carrierpronumber', value: trackingNumbers.join(',') });
                nRecord.save({ ignoreMandatoryFields: true });
            }
        } catch (ex) {
            log.error({ title: ex.name, details: ex });
        }
    }

    const createSPSPackage = (params) => {
        const { ifId, quantity, location, packageDefinition, package } = params;
        const packageRecord = nRecord.create({
            type: 'customrecord_sps_package',
            isDynamic: true
        });
        packageRecord.setValue({ fieldId: 'custrecord_sps_package_location', value: location });
        packageRecord.setValue({ fieldId: 'custrecord_sps_pack_asn', value: ifId });
        packageRecord.setValue({ fieldId: 'custrecord_sps_package_length', value: 1 });
        packageRecord.setValue({ fieldId: 'custrecord_sps_package_width', value: 1 });
        packageRecord.setValue({ fieldId: 'custrecord_sps_package_height', value: 1 });
        packageRecord.setValue({ fieldId: 'custrecord_sps_pk_weight', value: package?.weight || 1 });
        packageRecord.setValue({ fieldId: 'custrecord_sps_package_qty', value: quantity });
        packageRecord.setValue({ fieldId: 'custrecord_sps_package_box_type', value: packageDefinition });
        if (package?.trackingNumber) {
            packageRecord.setValue({ fieldId: 'custrecord_sps_track_num', value: package.trackingNumber });
        }
        return packageRecord.save({ ignoreMandatoryFields: true });
    }

    const createSPSPackageContent = (params) => {
        const { packageId, ifId, line, item, quantity, packageDefinition, inventoryDetails } = params;
        const packageContentRecord = nRecord.create({
            type: 'customrecord_sps_content',
            isDynamic: true
        });
        packageContentRecord.setValue({ fieldId: 'custrecord_sps_content_item', value: item });
        packageContentRecord.setValue({ fieldId: 'custrecord_sps_content_qty', value: quantity });
        packageContentRecord.setValue({ fieldId: 'custrecord_sps_content_package', value: packageId });
        packageContentRecord.setValue({ fieldId: 'custrecord_pack_content_fulfillment', value: ifId });
        packageContentRecord.setValue({ fieldId: 'custrecord_parent_pack_type', value: packageDefinition });
        packageContentRecord.setValue({ fieldId: 'custrecord_sps_content_item_line_num', value: line });
        if (inventoryDetails) {
            if (inventoryDetails.lotNumbers.length > 0) {
                packageContentRecord.setValue({ fieldId: 'custrecord_sps_content_lot', value: inventoryDetails.lotNumbers.join(',') });
            }
            if (inventoryDetails.expirationDates.length > 0) {
                packageContentRecord.setValue({ fieldId: 'custrecord_sps_content_expiration', value: inventoryDetails.expirationDates.join(',') });
            }
        }
        return packageContentRecord.save({ ignoreMandatoryFields: true });
    }

    const getInventoryDetails = (newRecord, line) => {
        newRecord.selectLine({ sublistId: 'item', line: line });
        const inventoryDetails = newRecord.getCurrentSublistSubrecord({ sublistId: 'item', fieldId: 'inventorydetail' });
        const lineCount = inventoryDetails.getLineCount({ sublistId: 'inventoryassignment' });
        const details = { expirationDates: [], lotNumbers: [] };
        for (let i = 0; i < lineCount; i++) {
            details.expirationDates.push(inventoryDetails.getSublistText({ sublistId: 'inventoryassignment', line: i, fieldId: 'expirationdate' }));
            details.lotNumbers.push(inventoryDetails.getSublistText({ sublistId: 'inventoryassignment', line: i, fieldId: 'issueinventorynumber' }));
        }
        return details;
    }

    return { afterSubmit };
});
