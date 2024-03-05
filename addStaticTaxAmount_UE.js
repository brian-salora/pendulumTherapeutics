/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 * @NModuleScope SameAccount
 *
 */
define(['N/record', 'N/search', 'N/error'],
function(record, search, error) {
  
  function afterSubmit(context) {

    try{

    log.debug('Starting script, context.type is:', context.type);
	  if (context.type != 'create') {
      log.debug('context.type is not create', 'Exiting script');
      return;
    }
		
	 var newTaxCodeInternalId = 1272;  //hardcoded TAX CODE to use here (in this case Shopify Tax Code)
		
     var salesOrder = context.newRecord;
	   var salesOrderId = salesOrder.id;

     //get the shipping address subrecord
      var shippingAddressSubrecord = salesOrder.getSubrecord({ fieldId: 'shippingaddress' });
      var shippingState = shippingAddressSubrecord.getValue({ fieldId: 'state' });

      if(shippingState.toUpperCase() != 'CO'){  //only proceed if the shipping state is CO
        log.debug('Shipping State is not CO', 'Exiting script');
        return;  
      }

      var salesOrderLoaded = record.load({type: record.Type.SALES_ORDER, id: salesOrderId, isDynamic: true});
		

		  // Iterate through line items
     const itemCount = salesOrderLoaded.getLineCount({ sublistId: 'item' });
	   var totalNumberGreaterThanZeroTaxLines = Number(0);
	   var taxRateTotalOfAllLines = Number(0);

     
	  
     //iterate lines to get total number of lines with tax
      for (let i = 0; i < itemCount; i++) {
        salesOrderLoaded.selectLine({ sublistId: 'item', line: i })
        const taxRate = salesOrderLoaded.getCurrentSublistValue({ sublistId: 'item', fieldId: 'taxrate1', line: i });
        log.debug('Line '+ i +' taxRate is:', taxRate);
        if (taxRate > 0) {
        if(taxRate > 0) totalNumberGreaterThanZeroTaxLines++;
		    taxRateTotalOfAllLines+= taxRate;
        
        log.debug('taxRateTotalOfAllLines is:', taxRateTotalOfAllLines);
    //      salesOrderLoaded.setSublistValue({ sublistId: 'item', fieldId: 'taxcode', line: i, value: newTaxCodeInternalId });
        }
		
      }

      if(taxRateTotalOfAllLines == 0 || totalNumberGreaterThanZeroTaxLines == 0) return;
	  
	  var spreadTaxRate = taxRateTotalOfAllLines / Number(totalNumberGreaterThanZeroTaxLines);
    log.debug('spreadTaxRate is:', spreadTaxRate);
	  
	  var salesOrderSubtotal = salesOrderLoaded.getValue({fieldId: 'subtotal'});
	  
	  var taxPercentageToAdd = ((Number(0.28) / Number(salesOrderSubtotal)) * Number(100));
	  log.debug('taxPercentageToAdd to all non-zero taxrate lines is:', taxPercentageToAdd);
	  
    //iterate lines to set updated tax rate
	  for (let i = 0; i < itemCount; i++) {
        const taxRate = salesOrderLoaded.getSublistValue({ sublistId: 'item', fieldId: 'taxrate1', line: i });
        salesOrderLoaded.selectLine({ sublistId: 'item', line: i })
        if (taxRate > 0) {
		  taxRateTotalOfAllLines+= taxRate;
		  log.debug('Line '+ i, 'Setting new TAXRATE of: '+ (Number(spreadTaxRate) + Number(taxPercentageToAdd)));
          salesOrderLoaded.setCurrentSublistValue({ sublistId: 'item', fieldId: 'taxrate1', line: i, value: Number(spreadTaxRate) +  Number(taxPercentageToAdd)});
          //salesOrderLoaded.setCurrentSublistValue({ sublistId: 'item', fieldId: 'taxrate1', line: i, value: Number(8.0066)});
          salesOrderLoaded.commitLine({sublistId: 'item', line: i});
          
        }
		
      }
	  
	  
	  // Update tax code on shipping
//      var shippingTaxRate = parseFloat(salesOrderLoaded.getValue({ fieldId: 'taxrate1' }));
//      if (shippingTaxRate > 0) {
//        var newShippingTaxRate = salesOrderLoaded.getValue({ fieldId: 'shippingtax1rate'});
//		    salesOrderLoaded.setValue({fieldId: 'shippingtax1rate', value: newShippingTaxRate});
//      }

      var savedSO = salesOrderLoaded.save({enableSourcing: true, ignoreMandatoryFields: true});
      log.debug('savedSO is:', savedSO);


    }catch(e){

      log.error('Error afterSubmit', e.message);
    }
                 
    }




    return {
        afterSubmit: afterSubmit
    };
    
});
